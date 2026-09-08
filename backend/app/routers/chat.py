"""The conversation that fills in the document."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.ai.client import AiUnavailable, complete
from app.ai.conversation import apply_updates
from app.ai.fields import load_fields, read
from app.ai.prompts import SYSTEM_PROMPT, describe_state
from app.ai.schema import build_response_schema
from app.config import Settings
from app.dependencies import get_db, get_settings
from app.schemas import ChatRequest, ChatResponse
from app.session import current_user

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.post("/message", response_model=ChatResponse)
def send_message(
    payload: ChatRequest,
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ChatResponse:
    # Every message costs money, so this is not left open to anyone who can
    # reach the port - placeholder session or not.
    if current_user(request, db, settings) is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in"
        )

    if not payload.messages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Send at least one message",
        )

    fields = load_fields(settings.fields_path)

    # Only the most recent turns are sent. A conversation that has run long is
    # one where the state summary below matters more than its own beginning.
    history = payload.messages[-settings.max_history_messages :]
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "system", "content": describe_state(fields, payload.values)},
        *(
            {"role": m.role, "content": m.content[: settings.max_message_characters]}
            for m in history
        ),
    ]

    try:
        answer = complete(settings, messages, build_response_schema(fields))
    except AiUnavailable as unavailable:
        # 503, not 500: nothing here is broken, and the document the user
        # already has is untouched and still downloadable.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(unavailable)
        ) from unavailable

    reply = answer.get("reply")
    updates = answer.get("updates")

    values = apply_updates(
        fields,
        payload.values,
        updates if isinstance(updates, dict) else {},
        settings.max_field_characters,
    )

    return ChatResponse(
        reply=reply if isinstance(reply, str) and reply.strip() else "…",
        values=values,
        # Conditional requirements included: a year count is outstanding only
        # when the term is the kind that has one, exactly as the form decides it.
        outstanding=[
            field.name
            for field in fields
            if field.is_required(values) and not read(values, field.path)
        ],
    )

"""The conversation that fills in the document."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.ai.catalogue import find, load_catalogue
from app.ai.client import AiUnavailable, complete
from app.ai.conversation import apply_updates
from app.ai.fields import read
from app.ai.prompts import (
    SYSTEM_PROMPT,
    catalogue_prompt,
    describe_choice,
    describe_state,
)
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

    catalogue = load_catalogue(settings.documents_path, settings.fields_path)
    chosen = find(catalogue, payload.documentId)

    # Only the most recent turns are sent. A conversation that has run long is
    # one where the state summary below matters more than its own beginning.
    history = payload.messages[-settings.max_history_messages :]
    state = [SYSTEM_PROMPT, catalogue_prompt(catalogue), describe_choice(chosen)]
    if chosen is not None:
        state.append(describe_state(chosen.fields, payload.values))

    messages = [
        *({"role": "system", "content": part} for part in state),
        *(
            {"role": m.role, "content": m.content[: settings.max_message_characters]}
            for m in history
        ),
    ]

    schema = build_response_schema(
        chosen.fields if chosen else (), tuple(d.id for d in catalogue)
    )

    try:
        answer = complete(settings, messages, schema)
    except AiUnavailable as unavailable:
        # 503, not 500: nothing here is broken, and the document the user
        # already has is untouched and still downloadable.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(unavailable)
        ) from unavailable

    reply = answer.get("reply")
    answered = answer.get("document")
    selected = find(catalogue, answered if isinstance(answered, str) else None)

    if selected is not None and selected is not chosen:
        # A different document, either just chosen or changed to. Its values
        # start empty: the answers given for a pilot agreement are not the
        # answers a HIPAA addendum needs, and carrying them over would put one
        # document's details into another's clauses. Any updates in this same
        # answer were shaped by the previous document's schema, so they go too.
        return ChatResponse(
            reply=_readable(reply),
            documentId=selected.id,
            values={},
            outstanding=[f.name for f in selected.fields if f.is_required({})],
        )

    if selected is None:
        # Still working out what they need, or they asked for something this
        # product cannot produce.
        return ChatResponse(
            reply=_readable(reply), documentId=None, values=payload.values, outstanding=[]
        )

    updates = answer.get("updates")
    values = apply_updates(
        selected.fields,
        payload.values,
        updates if isinstance(updates, dict) else {},
        settings.max_field_characters,
    )

    return ChatResponse(
        reply=_readable(reply),
        documentId=selected.id,
        values=values,
        # Conditional requirements included: a year count is outstanding only
        # when the term is the kind that has one, exactly as the form decides it.
        outstanding=[
            field.name
            for field in selected.fields
            if field.is_required(values) and not read(values, field.path)
        ],
    )


def _readable(reply: object) -> str:
    return reply if isinstance(reply, str) and reply.strip() else "…"

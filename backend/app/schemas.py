"""Request and response bodies."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LoginRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def strip_and_require_content(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Name must not be blank")
        return stripped


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class HealthResponse(BaseModel):
    status: str
    database: str


class ChatMessage(BaseModel):
    """One turn of the conversation, as the browser holds it.

    The history lives in the client and is replayed on each request. Nothing is
    stored: the database is rebuilt on every start, so keeping conversations in
    it would promise a durability that does not exist.
    """

    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    #: Which document is being drafted, or None while that is still unsettled.
    documentId: str | None = None
    #: The document as the browser currently has it, so the assistant can be
    #: told what is already recorded rather than inferring it from the history.
    values: dict[str, Any]


class ChatResponse(BaseModel):
    reply: str
    #: The document being drafted after this turn. It can differ from the
    #: request's when the user has just said what they want, or changed to
    #: something else.
    documentId: str | None
    #: The complete document values, merged on the server. Returning the whole
    #: thing rather than a patch keeps the merge in one place.
    values: dict[str, Any]
    outstanding: list[str]

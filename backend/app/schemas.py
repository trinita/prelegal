"""Request and response bodies."""

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


#: Deliberately permissive: enough to catch a typo, not enough to reject a
#: valid address this project has no way to deliver mail to anyway.
EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$")


def _clean_email(value: str) -> str:
    normalised = value.strip().lower()
    if not EMAIL_PATTERN.match(normalised):
        raise ValueError("Enter a valid email address")
    return normalised


class SignUpRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: str = Field(max_length=255)
    #: Eight characters is the floor, not advice. A maximum matters more than it
    #: looks: scrypt hashes whatever it is given, so an unbounded password is an
    #: unbounded amount of work for anyone who can reach the sign-up form.
    password: str = Field(min_length=8, max_length=200)

    @field_validator("name")
    @classmethod
    def strip_and_require_content(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Name must not be blank")
        return stripped

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        return _clean_email(value)


class LoginRequest(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(min_length=1, max_length=200)

    @field_validator("email")
    @classmethod
    def normalise_email(cls, value: str) -> str:
        return _clean_email(value)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str


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


class CreateDocumentRequest(BaseModel):
    """Starting a document. Only its type: the answers arrive as they are given."""

    documentType: str = Field(min_length=1, max_length=80)


class SaveDocumentRequest(BaseModel):
    """A change to a saved document.

    Either half can be sent alone. The chat saves a transcript, the form saves
    values, and neither should have to send the other's state back to leave it
    undisturbed.
    """

    values: dict[str, Any] | None = None
    transcript: list[ChatMessage] | None = None

    @model_validator(mode="after")
    def require_something_to_save(self) -> "SaveDocumentRequest":
        if self.values is None and self.transcript is None:
            raise ValueError("Send values, a transcript, or both")
        return self


class DocumentSummary(BaseModel):
    """One row of the list of documents someone has made."""

    id: int
    documentType: str
    #: Derived from the catalogue at read time rather than stored, so a document
    #: cannot end up labelled with a name the catalogue no longer uses.
    title: str
    createdAt: datetime
    updatedAt: datetime


class DocumentDetail(DocumentSummary):
    values: dict[str, Any]
    transcript: list[ChatMessage]

"""Database models.

Three tables, and none of them survive a restart: `reset_database` drops the
schema on every start. PL-10 asks for accounts and saved documents but keeps the
store temporary, so these are written as though the data mattered - real
password hashes, real session rows, cascades that clean up after a deleted user
- while the container goes on discarding all of it. Getting the shape right
costs nothing now and is the only way it is ever right later.
"""

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _now() -> datetime:
    """The clock these tables keep.

    Deliberately Python's rather than SQLite's: `CURRENT_TIMESTAMP` is only
    accurate to the second, and the browser saves a document as often as every
    800ms. Two saves inside one second would tie, and "the document I was just
    working on" would sort somewhere arbitrary in the list.
    """
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    #: The display name. No longer unique: the email address is the identity
    #: now, and two people are perfectly entitled to the same name.
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    documents: Mapped[list["SavedDocument"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )


class AuthSession(Base):
    """One signed-in browser.

    Named `AuthSession` rather than `Session` because `sqlalchemy.orm.Session`
    is imported by that name in nearly every module here, and a model competing
    for it would be misread on sight.

    Only a hash of the token is stored. The raw value exists in the cookie and
    for the length of one request, so a copy of this table - a stray dump, a log
    line - hands out no live sessions.
    """

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped["User"] = relationship(back_populates="sessions")


class SavedDocument(Base):
    """An agreement someone is drafting, or has drafted.

    `document_type` is the catalogue id - "mutual-nda", "pilot-agreement" - the
    same string the chat endpoint calls `documentId`. This row's own primary key
    is a different thing entirely, and is called a record id everywhere it
    surfaces, so the two are never mistaken for one another.

    `values` and `transcript` are stored as JSON because their shape belongs to
    the catalogue, not to the database: the Mutual NDA's structured cover page
    and the other ten documents' flat maps are both just objects here. Querying
    inside them is not something this product needs to do.
    """

    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    document_type: Mapped[str] = mapped_column(String(80))
    values: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    transcript: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    owner: Mapped["User"] = relationship(back_populates="documents")

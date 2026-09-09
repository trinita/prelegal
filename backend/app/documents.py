"""Saved documents: creating them, finding them, and writing to them.

Everything here takes the owner as an argument and filters on it *in the query*.
That is the whole access-control story for saved documents, and it is deliberate
that it cannot be forgotten at a call site: there is no function that fetches a
document by id alone, so a router has nothing to reach for that would skip the
check.
"""

from typing import Any

from sqlalchemy.orm import Session

from app.ai.catalogue import Document, find
from app.models import SavedDocument, User


def create_document(db: Session, owner: User, document_type: str) -> SavedDocument:
    """A new, empty document. Its answers arrive later, as they are given."""
    document = SavedDocument(
        owner_id=owner.id, document_type=document_type, values={}, transcript=[]
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def get_owned_document(
    db: Session, owner: User, document_id: int
) -> SavedDocument | None:
    """This person's document with that id, or None.

    Someone else's document and a document that was never there are the same
    answer, so the caller can only ever say "not found". Answering "forbidden"
    would confirm the row exists, which is a question no one else is entitled to
    ask.
    """
    return (
        db.query(SavedDocument)
        .filter(SavedDocument.id == document_id, SavedDocument.owner_id == owner.id)
        .one_or_none()
    )


def list_documents(db: Session, owner: User) -> list[SavedDocument]:
    """Everything this person has drafted, most recently worked on first."""
    return (
        db.query(SavedDocument)
        .filter(SavedDocument.owner_id == owner.id)
        .order_by(SavedDocument.updated_at.desc(), SavedDocument.id.desc())
        .all()
    )


def save_document(
    db: Session,
    document: SavedDocument,
    *,
    values: dict[str, Any] | None = None,
    transcript: list[dict[str, Any]] | None = None,
) -> SavedDocument:
    """Writes whichever halves were sent, leaving the other one alone."""
    if values is not None:
        document.values = values
    if transcript is not None:
        document.transcript = transcript

    db.commit()
    db.refresh(document)
    return document


def titles_for(
    documents: list[SavedDocument], catalogue: tuple[Document, ...]
) -> dict[int, str]:
    """A readable name per document, derived rather than stored.

    None of the eleven documents has a field that would serve as a title: only
    the Mutual NDA names its parties on the cover page, and the other ten each
    use their own field names. Picking one per document would be a second
    catalogue to keep in step with `documents.json`, so the name of the document
    type is used instead, numbered when someone has drafted more than one.

    Numbering follows the order they were created, so the first Pilot Agreement
    keeps its plain name however the list happens to be sorted.
    """
    titles: dict[int, str] = {}
    seen: dict[str, int] = {}

    for document in sorted(documents, key=lambda saved: saved.id):
        known = find(catalogue, document.document_type)
        base = known.name if known is not None else "Document"
        count = seen[document.document_type] = seen.get(document.document_type, 0) + 1
        titles[document.id] = base if count == 1 else f"{base} ({count})"

    return titles

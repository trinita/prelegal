"""The documents someone has drafted.

The browser is what decides when to save: a document changes both by talking to
the assistant and by typing into the form, and only one of those goes through
the chat endpoint. Persisting from there would have left every hand-typed
correction unsaved, so the chat stays as it was - stateless, storing nothing -
and these routes are the one place a document is written.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.ai.catalogue import find, load_catalogue
from app.config import Settings
from app.dependencies import get_current_user, get_db, get_settings
from app.documents import (
    create_document,
    get_owned_document,
    list_documents,
    save_document,
    titles_for,
)
from app.models import SavedDocument, User
from app.schemas import (
    CreateDocumentRequest,
    DocumentDetail,
    DocumentSummary,
    SaveDocumentRequest,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])

_NOT_FOUND = "No such document"


def _summary(document: SavedDocument, title: str) -> DocumentSummary:
    return DocumentSummary(
        id=document.id,
        documentType=document.document_type,
        title=title,
        createdAt=document.created_at,
        updatedAt=document.updated_at,
    )


def _detail(document: SavedDocument, title: str) -> DocumentDetail:
    return DocumentDetail(
        **_summary(document, title).model_dump(),
        values=document.values or {},
        transcript=document.transcript or [],
    )


def _title_of(document: SavedDocument, settings: Settings) -> str:
    catalogue = load_catalogue(settings.documents_path, settings.fields_path)
    return titles_for([document], catalogue)[document.id]


@router.get("", response_model=list[DocumentSummary])
def index(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> list[DocumentSummary]:
    documents = list_documents(db, user)
    catalogue = load_catalogue(settings.documents_path, settings.fields_path)
    titles = titles_for(documents, catalogue)
    return [_summary(document, titles[document.id]) for document in documents]


@router.post("", response_model=DocumentDetail, status_code=status.HTTP_201_CREATED)
def create(
    payload: CreateDocumentRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DocumentDetail:
    catalogue = load_catalogue(settings.documents_path, settings.fields_path)
    if find(catalogue, payload.documentType) is None:
        # A document type the templates do not have could never be rendered, so
        # it is refused here rather than saved and discovered later.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No such document type",
        )

    document = create_document(db, user, payload.documentType)
    return _detail(document, _title_of(document, settings))


@router.get("/{document_id}", response_model=DocumentDetail)
def show(
    document_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DocumentDetail:
    document = get_owned_document(db, user, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return _detail(document, _title_of(document, settings))


@router.put("/{document_id}", response_model=DocumentDetail)
def update(
    document_id: int,
    payload: SaveDocumentRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> DocumentDetail:
    document = get_owned_document(db, user, document_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)

    saved = save_document(
        db,
        document,
        values=payload.values,
        transcript=(
            None
            if payload.transcript is None
            else [turn.model_dump() for turn in payload.transcript]
        ),
    )
    return _detail(saved, _title_of(saved, settings))

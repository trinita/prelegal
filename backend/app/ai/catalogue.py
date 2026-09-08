"""Every document this product can generate.

The Mutual NDA is described by `mnda-fields.json`, because Common Paper
publishes a cover page for it and PL-6 built the renderer around that page. The
other ten are described by `documents.json`, whose fields are the defined terms
their Standard Terms actually reference - derived from the templates, so the
catalogue cannot claim a document the templates do not support.

Both arrive here as the same `Field`, so everything downstream - the response
schema, the merge, the state summary - works without knowing which file a
document came from.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.ai.fields import Field, field_from, load_fields


@dataclass(frozen=True)
class Document:
    id: str
    name: str
    summary: str
    #: Other names people call this document, so a request for "a SaaS
    #: agreement" or "an EULA" finds its way to the right template.
    aliases: tuple[str, ...]
    fields: tuple[Field, ...]

    def describe(self) -> str:
        """One catalogue line, as the assistant sees it."""
        also = f" Also called: {', '.join(self.aliases)}." if self.aliases else ""
        return f"- {self.id}: {self.name}. {self.summary}{also}"


MUTUAL_NDA_ID = "mutual-nda"


@lru_cache
def load_catalogue(documents_path: Path, mnda_path: Path) -> tuple[Document, ...]:
    raw: dict[str, Any] = json.loads(documents_path.read_text())

    mnda = Document(
        id=MUTUAL_NDA_ID,
        name="Mutual Non-Disclosure Agreement",
        summary="A two-way NDA, so each side can share confidential information for an agreed purpose.",
        aliases=("nda", "mutual nda", "confidentiality agreement", "mnda", "non-disclosure"),
        fields=load_fields(mnda_path),
    )

    others = tuple(
        Document(
            id=entry["id"],
            name=entry["name"],
            summary=entry["summary"],
            aliases=tuple(entry["aliases"]),
            fields=tuple(field_from(field) for field in entry["fields"]),
        )
        for entry in raw["documents"]
    )

    catalogue = (mnda, *others)

    ids = [document.id for document in catalogue]
    if len(ids) != len(set(ids)):
        raise ValueError(f"Duplicate document id in {documents_path}")

    return catalogue


def find(catalogue: tuple[Document, ...], document_id: str | None) -> Document | None:
    if document_id is None:
        return None
    return next((d for d in catalogue if d.id == document_id), None)

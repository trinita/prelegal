"""The document's fields, read from the shared schema.

`mnda-fields.json` at the repository root is the single definition of what the
Mutual NDA cover page contains. The frontend's form reads its own copy in
TypeScript and is tested against this same file, so the two cannot drift apart
without the suite noticing - the same guarantee `sync-templates.mjs` gives the
legal text.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Field:
    name: str
    type: str
    #: How the field is named to the assistant, which is told to speak plainly.
    #: The machine-facing `name` is never meant to reach a person.
    label: str
    description: str
    required: bool
    enum: tuple[str, ...] | None
    #: Plain-language wording for enum values, so "untilTerminated" is never
    #: what the assistant has to work with.
    value_labels: dict[str, str]
    #: What the template prints before anyone has said anything. Present only
    #: for the fields that start filled in.
    default: str | None
    #: A field required only in some circumstances, as a (field, value) pair:
    #: the year count matters only if the term is the kind that expires.
    required_when: tuple[str, str] | None

    @property
    def path(self) -> tuple[str, ...]:
        """('partyOne', 'company') for a dotted name; ('purpose',) for a flat one."""
        return tuple(self.name.split("."))

    def is_required(self, values: dict[str, Any]) -> bool:
        """Whether this field must be filled, given the rest of the document.

        Mirrors `REQUIREMENTS` in the frontend's fields.ts. Without the
        condition the assistant would call a document ready while the preview
        beside it still showed a gap.
        """
        if not self.required:
            return False

        if self.required_when is None:
            return True

        other, expected = self.required_when
        return read(values, tuple(other.split("."))) == expected

    def describes(self, value: str) -> str:
        """A value as the assistant should see it."""
        return self.value_labels.get(value, value)


def read(values: dict[str, Any], path: tuple[str, ...]) -> str:
    """The value at a dotted path, as text. Missing or oddly shaped reads empty."""
    current: Any = values
    for step in path:
        current = current.get(step) if isinstance(current, dict) else None
    return str(current).strip() if isinstance(current, (str, int, float)) else ""


@lru_cache
def load_fields(path: Path) -> tuple[Field, ...]:
    raw: dict[str, Any] = json.loads(path.read_text())

    fields = tuple(
        Field(
            name=entry["name"],
            type=entry["type"],
            label=entry["label"],
            description=entry["description"],
            required=entry["required"],
            enum=tuple(entry["enum"]) if "enum" in entry else None,
            value_labels=entry.get("valueLabels", {}),
            default=entry.get("default"),
            required_when=(
                (entry["requiredWhen"]["field"], entry["requiredWhen"]["equals"])
                if "requiredWhen" in entry
                else None
            ),
        )
        for entry in raw["fields"]
    )

    if not fields:
        raise ValueError(f"No fields defined in {path}")

    return fields

"""The JSON schema the model must answer with.

Every field is nullable and every field is required. That combination is what
makes `null` mean "the user did not say", rather than the model being forced to
invent a value for each field on every turn: strict mode demands that all
properties be present, so absence has to be expressed in the value.
"""

from typing import Any

from app.ai.fields import Field

REPLY_DESCRIPTION = (
    "What to say to the user next: an acknowledgement of what they just told you, "
    "and a question about what is still missing. Plain prose, no markdown."
)


def _property_for(field: Field) -> dict[str, Any]:
    if field.enum is not None:
        # A closed list the model cannot invent outside of - which is why the
        # governing law can only ever be one of the 51 real US states.
        return {
            "type": ["string", "null"],
            "enum": [*field.enum, None],
            "description": field.description,
        }

    return {"type": ["string", "null"], "description": field.description}


DOCUMENT_DESCRIPTION = (
    "Which document is being drafted. Set it as soon as you know, and change it "
    "only when the user asks for a different document. Null while it is still "
    "unclear, or while they are asking about something this product cannot "
    "produce. Never guess: an agreement of the wrong kind is worse than a "
    "question."
)


def build_response_schema(
    fields: tuple[Field, ...],
    document_ids: tuple[str, ...],
) -> dict[str, Any]:
    """The shape of one answer.

    `fields` is empty until a document has been chosen, which is why `updates`
    is only part of the schema once there is something to extract into. Asking
    the model for values before knowing the document would invite it to fill in
    a form it has not been shown.
    """
    properties: dict[str, Any] = {
        "reply": {"type": "string", "description": REPLY_DESCRIPTION},
        "document": {
            "type": ["string", "null"],
            "enum": [*document_ids, None],
            "description": DOCUMENT_DESCRIPTION,
        },
    }

    if fields:
        updates = {field.name: _property_for(field) for field in fields}
        properties["updates"] = {
            "type": "object",
            "additionalProperties": False,
            "required": list(updates),
            "properties": updates,
            "description": (
                "Fields the user has now told you, and only those. Use null for "
                "anything they have not stated - never guess, and never repeat a "
                "value that is already recorded unless they changed it."
            ),
        }

    return {
        "name": "document_turn",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": list(properties),
            "properties": properties,
        },
    }

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


def build_response_schema(fields: tuple[Field, ...]) -> dict[str, Any]:
    updates = {field.name: _property_for(field) for field in fields}

    return {
        "name": "mnda_turn",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["reply", "updates"],
            "properties": {
                "reply": {"type": "string", "description": REPLY_DESCRIPTION},
                "updates": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": list(updates),
                    "properties": updates,
                    "description": (
                        "Fields the user has now told you, and only those. Use null for "
                        "anything they have not stated - never guess, and never repeat a "
                        "value that is already recorded unless they changed it."
                    ),
                },
            },
        },
    }

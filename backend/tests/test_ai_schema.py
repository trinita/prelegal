"""The response schema must satisfy what strict structured outputs demand.

Getting any of this wrong shows up as the provider rejecting the request, or -
worse - as the model inventing values, so it is pinned here rather than
discovered in a conversation.
"""

import pytest

from app.ai.fields import Field, load_fields
from app.ai.schema import build_response_schema
from app.config import Settings


@pytest.fixture
def schema() -> dict:
    return build_response_schema(load_fields(Settings().fields_path))


@pytest.fixture
def fields() -> tuple[Field, ...]:
    return load_fields(Settings().fields_path)


def test_it_is_strict(schema: dict) -> None:
    assert schema["strict"] is True
    assert schema["schema"]["additionalProperties"] is False
    assert schema["schema"]["properties"]["updates"]["additionalProperties"] is False


def test_every_field_is_required_and_nullable(
    schema: dict, fields: tuple[Field, ...]
) -> None:
    """Strict mode demands every property be present, so 'the user did not say'
    has to be expressible as a value rather than as an omission."""
    updates = schema["schema"]["properties"]["updates"]

    assert set(updates["required"]) == {field.name for field in fields}

    for name, spec in updates["properties"].items():
        assert "null" in spec["type"], f"{name} cannot be null"


def test_a_closed_list_still_allows_null(
    schema: dict, fields: tuple[Field, ...]
) -> None:
    updates = schema["schema"]["properties"]["updates"]["properties"]

    for field in fields:
        if field.enum is None:
            continue
        assert None in updates[field.name]["enum"], f"{field.name} cannot be left unsaid"
        assert set(field.enum) <= set(updates[field.name]["enum"])


def test_the_governing_law_is_a_closed_list_of_states(schema: dict) -> None:
    enum = schema["schema"]["properties"]["updates"]["properties"]["governingLaw"]["enum"]

    assert "Delaware" in enum
    assert "Narnia" not in enum
    assert len([value for value in enum if value is not None]) == 51


def test_every_field_carries_a_description(fields: tuple[Field, ...]) -> None:
    """The descriptions are the model's only guidance on what a field means."""
    for field in fields:
        assert field.description.strip(), f"{field.name} has no description"

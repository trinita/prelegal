"""The response schema must satisfy what strict structured outputs demand.

Getting any of this wrong shows up as the provider rejecting the request, or -
worse - as the model inventing values, so it is pinned here rather than
discovered in a conversation.
"""

import pytest

from app.ai.catalogue import load_catalogue
from app.ai.fields import Field, load_fields
from app.ai.schema import build_response_schema
from app.config import Settings

DOCUMENT_IDS = tuple(
    d.id for d in load_catalogue(Settings().documents_path, Settings().fields_path)
)


@pytest.fixture
def schema() -> dict:
    return build_response_schema(load_fields(Settings().fields_path), DOCUMENT_IDS)


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


def test_the_document_is_a_closed_list_that_allows_null(schema: dict) -> None:
    """The assistant can only name a document the templates actually support."""
    document = schema["schema"]["properties"]["document"]

    assert "mutual-nda" in document["enum"]
    assert None in document["enum"]
    assert "employment-contract" not in document["enum"]


def test_there_is_nothing_to_extract_into_before_a_document_is_chosen() -> None:
    """Asking for values first would invite filling in a form it has not seen."""
    schema = build_response_schema((), DOCUMENT_IDS)

    assert "updates" not in schema["schema"]["properties"]
    assert set(schema["schema"]["required"]) == {"reply", "document"}


def test_every_document_in_the_catalogue_builds_a_strict_schema() -> None:
    """Each of the eleven has to survive the provider's strict-mode rules."""
    settings = Settings()

    for document in load_catalogue(settings.documents_path, settings.fields_path):
        built = build_response_schema(document.fields, DOCUMENT_IDS)
        updates = built["schema"]["properties"]["updates"]

        assert built["strict"] is True, document.id
        assert set(updates["required"]) == {f.name for f in document.fields}, document.id
        for name, spec in updates["properties"].items():
            assert "null" in spec["type"], f"{document.id}.{name}"

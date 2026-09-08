"""Writing a model's answer into the document.

These are the rules that decide what a signed agreement ends up saying, so they
are pinned tightly: what gets written, and - more importantly - what does not.
"""

from typing import Any

import pytest

from app.ai.conversation import apply_updates
from app.ai.fields import Field, load_fields
from app.config import Settings


@pytest.fixture
def fields() -> tuple[Field, ...]:
    return load_fields(Settings().fields_path)


def empty() -> dict[str, Any]:
    return {"purpose": "", "partyOne": {"company": ""}, "partyTwo": {"company": ""}}


def test_a_stated_value_is_written(fields: tuple[Field, ...]) -> None:
    result = apply_updates(fields, empty(), {"purpose": "Evaluating a partnership"})

    assert result["purpose"] == "Evaluating a partnership"


def test_a_nested_value_reaches_its_party(fields: tuple[Field, ...]) -> None:
    result = apply_updates(fields, empty(), {"partyOne.company": "Acme Ltd"})

    assert result["partyOne"]["company"] == "Acme Ltd"


def test_null_leaves_what_is_already_there(fields: tuple[Field, ...]) -> None:
    values = apply_updates(fields, empty(), {"purpose": "Evaluating a partnership"})

    result = apply_updates(fields, values, {"purpose": None})

    assert result["purpose"] == "Evaluating a partnership"


def test_an_empty_string_does_not_erase_a_value(fields: tuple[Field, ...]) -> None:
    """The model reporting nothing must never wipe what the user gave."""
    values = apply_updates(fields, empty(), {"partyOne.company": "Acme Ltd"})

    result = apply_updates(fields, values, {"partyOne.company": "   "})

    assert result["partyOne"]["company"] == "Acme Ltd"


def test_a_value_outside_an_enum_is_discarded(fields: tuple[Field, ...]) -> None:
    # Strict schemas should prevent this; it would reach the agreement if not.
    result = apply_updates(fields, empty(), {"governingLaw": "Narnia"})

    assert "governingLaw" not in result


def test_a_real_state_is_kept(fields: tuple[Field, ...]) -> None:
    result = apply_updates(fields, empty(), {"governingLaw": "Delaware"})

    assert result["governingLaw"] == "Delaware"


@pytest.mark.parametrize("bad", ["soon", "-2", "3.5", "two"])
def test_a_year_count_that_is_not_a_positive_whole_number_is_discarded(
    fields: tuple[Field, ...], bad: str
) -> None:
    result = apply_updates(fields, empty(), {"mndaTermYears": bad})

    assert "mndaTermYears" not in result


def test_surrounding_whitespace_is_trimmed(fields: tuple[Field, ...]) -> None:
    result = apply_updates(fields, empty(), {"jurisdiction": "  New Castle, DE  "})

    assert result["jurisdiction"] == "New Castle, DE"


def test_a_field_the_model_invented_is_ignored(fields: tuple[Field, ...]) -> None:
    result = apply_updates(fields, empty(), {"secretClause": "Pay me twice"})

    assert "secretClause" not in result


def test_the_caller_s_values_are_not_mutated(fields: tuple[Field, ...]) -> None:
    values = empty()

    apply_updates(fields, values, {"partyOne.company": "Acme Ltd"})

    assert values["partyOne"]["company"] == ""


@pytest.mark.parametrize("bad", ["next month", "06/15/26", "March 3rd 2027", "2027-13-01", "2027-3-3"])
def test_a_date_that_is_not_iso_is_discarded(fields: tuple[Field, ...], bad: str) -> None:
    """The renderer prints what it cannot parse verbatim, and marks it filled -
    so an unparseable date would look like one somebody had confirmed."""
    result = apply_updates(fields, empty(), {"effectiveDate": bad})

    assert "effectiveDate" not in result


def test_a_real_iso_date_is_kept(fields: tuple[Field, ...]) -> None:
    result = apply_updates(fields, empty(), {"effectiveDate": "2027-03-03"})

    assert result["effectiveDate"] == "2027-03-03"


def test_an_oversized_value_is_refused_rather_than_trimmed(
    fields: tuple[Field, ...],
) -> None:
    """Half a notice address in a signed agreement is worse than none."""
    result = apply_updates(fields, empty(), {"jurisdiction": "x" * 1001}, max_characters=1000)

    assert "jurisdiction" not in result


def test_a_value_at_the_limit_is_kept(fields: tuple[Field, ...]) -> None:
    result = apply_updates(fields, empty(), {"jurisdiction": "x" * 1000}, max_characters=1000)

    assert result["jurisdiction"] == "x" * 1000

"""Turning a model answer into the document's values."""

import logging
from copy import deepcopy
from datetime import date
from typing import Any

from app.ai.fields import Field

logger = logging.getLogger(__name__)


def _is_acceptable(field: Field, value: Any, limit: int) -> bool:
    if not isinstance(value, str):
        return False

    text = value.strip()
    if not text:
        return False

    if len(text) > limit:
        # Refused rather than trimmed: half a notice address in a signed
        # agreement is worse than none, and the user can be asked again.
        logger.warning("Discarding %s: %d characters is beyond the limit", field.name, len(text))
        return False

    if field.enum is not None and text not in field.enum:
        # Strict schemas should make this impossible; checked anyway, because a
        # value outside the list would reach the signed document.
        logger.warning("Discarding %s: %r is not one of its allowed values", field.name, text)
        return False

    if field.type == "integer-string" and not (text.isdigit() and int(text) > 0):
        logger.warning("Discarding %s: %r is not a positive whole number", field.name, text)
        return False

    if field.type == "date" and not _is_iso_date(text):
        # The renderer prints anything it cannot parse verbatim, and marks it as
        # a filled value - so "next month" would reach the agreement looking
        # like a date somebody had confirmed.
        logger.warning("Discarding %s: %r is not an ISO date", field.name, text)
        return False

    return True


def _is_iso_date(text: str) -> bool:
    try:
        return date.fromisoformat(text).isoformat() == text
    except ValueError:
        return False


def apply_updates(
    fields: tuple[Field, ...],
    values: dict[str, Any],
    updates: dict[str, Any],
    max_characters: int = 1000,
) -> dict[str, Any]:
    """The document's values with this turn's extractions written in.

    `null` means the user did not say, and so does an empty string: the model
    reporting nothing must never be able to erase what the user already gave. To
    clear a value deliberately, they edit the fields directly - which is one of
    the reasons that form is still there.
    """
    merged = deepcopy(values)

    for field in fields:
        if field.name not in updates:
            continue

        candidate = updates[field.name]
        if not _is_acceptable(field, candidate, max_characters):
            continue

        *parents, leaf = field.path
        target = merged
        for step in parents:
            target = target.setdefault(step, {})
        target[leaf] = candidate.strip()

    return merged

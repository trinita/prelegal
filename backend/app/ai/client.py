"""The call to the model.

CLAUDE.md pins this: LiteLLM to OpenRouter, the gpt-oss-120b model, with
Cerebras as the inference provider and Structured Outputs so the answer can be
read as data rather than parsed out of prose.
"""

import json
import logging
from typing import Any

import litellm

from app.config import Settings

logger = logging.getLogger(__name__)


class AiUnavailable(Exception):
    """The model could not be reached, or did not answer usefully.

    Raised for a missing key, a network failure, a rate limit and a malformed
    answer alike, because the caller's options are the same in every case: tell
    the user, and keep the document they already have.
    """


def complete(
    settings: Settings,
    messages: list[dict[str, str]],
    response_schema: dict[str, Any],
) -> dict[str, Any]:
    if not settings.openrouter_api_key:
        raise AiUnavailable(
            "No OPENROUTER_API_KEY is configured, so the assistant cannot answer."
        )

    try:
        response = litellm.completion(
            model=settings.ai_model,
            messages=messages,
            api_key=settings.openrouter_api_key,
            response_format={"type": "json_schema", "json_schema": response_schema},
            timeout=settings.ai_timeout_seconds,
            # Pin the inference provider: the same model served elsewhere may not
            # honour strict structured outputs, and a silent fallback would show
            # up as unparseable answers rather than as a routing change.
            extra_body={
                "provider": {
                    "order": [settings.ai_provider],
                    "allow_fallbacks": False,
                }
            },
        )
    except Exception as error:  # noqa: BLE001 - every failure is the same to the caller
        logger.warning("Model call failed: %s", error)
        raise AiUnavailable("The assistant is unavailable right now.") from error

    try:
        content = response.choices[0].message.content
        parsed = json.loads(content)
    except (AttributeError, IndexError, TypeError, ValueError) as error:
        logger.warning("Model returned something unreadable: %s", error)
        raise AiUnavailable("The assistant returned an unreadable answer.") from error

    if not isinstance(parsed, dict):
        raise AiUnavailable("The assistant returned an unreadable answer.")

    return parsed

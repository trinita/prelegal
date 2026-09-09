"""The chat endpoint, with the model stubbed out. No test makes a network call."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.ai.client import AiUnavailable
from app.routers import chat


def stub_model(monkeypatch: pytest.MonkeyPatch, answer: dict[str, Any]) -> list[list]:
    """Replace the model call, capturing the messages it was sent.

    Answers default to staying on the Mutual NDA, so a test only says
    "document" when the document itself is what it is about.
    """
    sent: list[list] = []
    full = {"document": "mutual-nda", **answer}

    def fake_complete(settings, messages, response_schema):
        sent.append(messages)
        return full

    monkeypatch.setattr(chat, "complete", fake_complete)
    return sent


def ask(client: TestClient, content: str = "hello", **body):
    """A chat request already on the Mutual NDA, unless told otherwise."""
    return client.post(
        "/api/chat/message",
        json={
            "messages": [{"role": "user", "content": content}],
            "documentId": "mutual-nda",
            "values": {},
            **body,
        },
    )


def test_a_reply_and_the_extracted_values_come_back(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    stub_model(
        monkeypatch,
        {"reply": "Got it. Who is signing?", "updates": {"governingLaw": "Delaware"}},
    )

    response = signed_in.post(
        "/api/chat/message",
        json={
            "messages": [{"role": "user", "content": "Delaware law please"}],
            "documentId": "mutual-nda",
            "values": {"governingLaw": ""},
        },
    )

    assert response.status_code == 200
    assert response.json()["reply"] == "Got it. Who is signing?"
    assert response.json()["values"]["governingLaw"] == "Delaware"


def test_what_is_still_missing_comes_back_too(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    stub_model(monkeypatch, {"reply": "Noted.", "updates": {"governingLaw": "Delaware"}})

    response = signed_in.post(
        "/api/chat/message",
        json={"messages": [{"role": "user", "content": "Delaware"}], "documentId": "mutual-nda",
            "values": {}},
    )

    outstanding = response.json()["outstanding"]
    assert "governingLaw" not in outstanding
    assert "purpose" in outstanding
    # Optional fields are never outstanding, however empty they are.
    assert "modifications" not in outstanding
    assert "partyOne.title" not in outstanding


def test_the_model_is_told_what_is_already_recorded(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Sent fresh each turn, so a long chat cannot drift from the document."""
    sent = stub_model(monkeypatch, {"reply": "ok", "updates": {}})

    signed_in.post(
        "/api/chat/message",
        json={
            "messages": [{"role": "user", "content": "hello"}],
            "documentId": "mutual-nda",
            "values": {"jurisdiction": "New Castle, DE"},
        },
    )

    state = "\n".join(m["content"] for m in sent[0] if m["role"] == "system")
    assert "New Castle, DE" in state
    assert "what the confidential information may be used for" in state


def test_the_model_is_never_shown_a_field_name_or_a_code_word(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """It is told to speak plainly, so it must not be handed jargon to echo."""
    sent = stub_model(monkeypatch, {"reply": "ok", "updates": {}})

    signed_in.post(
        "/api/chat/message",
        json={
            "messages": [{"role": "user", "content": "hello"}],
            "documentId": "mutual-nda",
            "values": {"mndaTermType": "untilTerminated", "partyOne": {"printName": "Ada"}},
        },
    )

    state = "\n".join(m["content"] for m in sent[0] if m["role"] == "system")
    for jargon in ("partyOne", "printName", "untilTerminated", "mndaTermType", "noticeAddress"):
        assert jargon not in state, f"{jargon} would be handed to the assistant"


def test_a_default_is_offered_for_confirmation_rather_than_taken_as_answered(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Nobody should sign a one-year term they were never asked about."""
    sent = stub_model(monkeypatch, {"reply": "ok", "updates": {}})

    signed_in.post(
        "/api/chat/message",
        json={
            "messages": [{"role": "user", "content": "hello"}],
            # What the browser sends on the first turn: the template's defaults.
            "documentId": "mutual-nda",
            "values": {"mndaTermYears": "1", "confidentialityYears": "1"},
        },
    )

    state = "\n".join(m["content"] for m in sent[0] if m["role"] == "system")
    told, _, rest = state.partition("Standard wording they have NOT agreed to yet")

    assert "how many years the agreement runs" in rest
    assert "how many years the agreement runs" not in told
    assert "Nothing is outstanding" not in state


def test_a_value_the_user_chose_is_settled_even_if_it_equals_the_default(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent = stub_model(monkeypatch, {"reply": "ok", "updates": {}})

    signed_in.post(
        "/api/chat/message",
        json={
            "messages": [{"role": "user", "content": "two years"}],
            "documentId": "mutual-nda",
            "values": {"mndaTermYears": "2"},
        },
    )

    state = "\n".join(m["content"] for m in sent[0] if m["role"] == "system")
    told, _, rest = state.partition("Standard wording they have NOT agreed to yet")

    assert "how many years the agreement runs: 2" in told


def test_a_year_count_is_outstanding_only_when_the_term_has_one(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Mirrors the form, so the chat cannot call a document ready that it calls
    incomplete."""
    stub_model(monkeypatch, {"reply": "ok", "updates": {}})

    expires = signed_in.post(
        "/api/chat/message",
        json={
            "messages": [{"role": "user", "content": "hi"}],
            "documentId": "mutual-nda",
            "values": {"mndaTermType": "expires", "mndaTermYears": ""},
        },
    ).json()["outstanding"]

    forever = signed_in.post(
        "/api/chat/message",
        json={
            "messages": [{"role": "user", "content": "hi"}],
            "documentId": "mutual-nda",
            "values": {"mndaTermType": "untilTerminated", "mndaTermYears": ""},
        },
    ).json()["outstanding"]

    assert "mndaTermYears" in expires
    assert "mndaTermYears" not in forever


def test_history_is_capped(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent = stub_model(monkeypatch, {"reply": "ok", "updates": {}})
    messages = [{"role": "user", "content": f"message {i}"} for i in range(120)]

    signed_in.post(
        "/api/chat/message",
        json={"messages": messages, "documentId": "mutual-nda", "values": {}},
    )

    forwarded = [m for m in sent[0] if m["role"] != "system"]
    assert len(forwarded) == 40
    # The most recent turns are the ones kept.
    assert forwarded[-1]["content"] == "message 119"


def test_an_over_long_message_is_truncated(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent = stub_model(monkeypatch, {"reply": "ok", "updates": {}})

    signed_in.post(
        "/api/chat/message",
        json={
            "messages": [{"role": "user", "content": "x" * 10_000}],
            "documentId": "mutual-nda",
            "values": {},
        },
    )

    forwarded = [m for m in sent[0] if m["role"] != "system"]
    assert len(forwarded[0]["content"]) == 4000


def test_an_unavailable_model_is_503_not_500(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Nothing is broken: the user's document is untouched and still downloadable."""

    def unavailable(settings, messages, response_schema):
        raise AiUnavailable("No OPENROUTER_API_KEY is configured.")

    monkeypatch.setattr(chat, "complete", unavailable)

    response = signed_in.post(
        "/api/chat/message",
        json={"messages": [{"role": "user", "content": "hello"}], "documentId": "mutual-nda",
            "values": {}},
    )

    assert response.status_code == 503
    assert "OPENROUTER_API_KEY" in response.json()["detail"]


def test_a_model_answer_missing_its_updates_does_not_fail_the_turn(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    stub_model(monkeypatch, {"reply": "Sorry, could you repeat that?"})

    response = signed_in.post(
        "/api/chat/message",
        json={
            "messages": [{"role": "user", "content": "hi"}],
            "documentId": "mutual-nda",
            "values": {"purpose": "Evaluating a partnership"},
        },
    )

    assert response.status_code == 200
    assert response.json()["values"]["purpose"] == "Evaluating a partnership"


def test_signing_in_is_required(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Each message costs money, so the endpoint is not left open."""
    stub_model(monkeypatch, {"reply": "ok", "updates": {}})

    response = client.post(
        "/api/chat/message",
        json={"messages": [{"role": "user", "content": "hello"}], "documentId": "mutual-nda",
            "values": {}},
    )

    assert response.status_code == 401


def test_an_empty_conversation_is_rejected(signed_in: TestClient) -> None:
    response = signed_in.post(
        "/api/chat/message",
        json={"messages": [], "documentId": "mutual-nda", "values": {}},
    )

    assert response.status_code == 422

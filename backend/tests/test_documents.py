"""Choosing a document, changing it, and being asked for one we do not have."""

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.ai.catalogue import load_catalogue
from app.config import Settings
from app.routers import chat


@pytest.fixture
def signed_in(client: TestClient) -> TestClient:
    client.post("/api/auth/login", json={"name": "Ada Lovelace"})
    return client


def stub(monkeypatch: pytest.MonkeyPatch, answer: dict[str, Any]) -> list[list]:
    sent: list[list] = []

    def fake_complete(settings, messages, response_schema):
        sent.append(messages)
        return answer

    monkeypatch.setattr(chat, "complete", fake_complete)
    return sent


def send(client: TestClient, **body):
    return client.post(
        "/api/chat/message",
        json={"messages": [{"role": "user", "content": "hello"}], "values": {}, **body},
    )


def test_the_catalogue_reaches_the_assistant(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """It has no other way to know what the templates cover, and offering to
    draft something that does not exist is the worst thing it could do."""
    sent = stub(monkeypatch, {"reply": "Which one?", "document": None})

    send(signed_in, documentId=None)

    state = "\n".join(m["content"] for m in sent[0] if m["role"] == "system")
    for document in load_catalogue(Settings().documents_path, Settings().fields_path):
        assert document.name in state, document.id
    # And the ways people actually ask for them.
    assert "saas agreement" in state
    assert "eula" in state


def test_nothing_is_collected_before_a_document_is_chosen(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    sent = stub(monkeypatch, {"reply": "What do you need?", "document": None})

    response = send(signed_in, documentId=None)

    assert response.json()["documentId"] is None
    assert response.json()["outstanding"] == []
    # There is nothing to extract into yet, so the model is not asked for values.
    schema_sent = "\n".join(m["content"] for m in sent[0] if m["role"] == "system")
    assert "No document chosen yet" in schema_sent


def test_choosing_a_document_reports_what_it_needs(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    stub(monkeypatch, {"reply": "A pilot agreement it is.", "document": "pilot-agreement"})

    response = send(signed_in, documentId=None).json()

    assert response["documentId"] == "pilot-agreement"
    assert "provider" in response["outstanding"]
    assert "pilotPeriod" in response["outstanding"]


def test_changing_document_does_not_carry_the_old_answers_over(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A pilot agreement's answers are not what a HIPAA addendum needs, and
    carrying them over would put one document's details into another's clauses."""
    stub(
        monkeypatch,
        {
            "reply": "Switching to the BAA.",
            "document": "business-associate-agreement",
            # Shaped by the previous document's schema, so meaningless here.
            "updates": {"pilotPeriod": "60 days"},
        },
    )

    response = send(
        signed_in,
        documentId="pilot-agreement",
        values={"pilotPeriod": "60 days", "provider": "Acme"},
    ).json()

    assert response["documentId"] == "business-associate-agreement"
    assert response["values"] == {}
    assert "pilotPeriod" not in response["values"]


def test_staying_on_the_same_document_keeps_its_answers(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    stub(
        monkeypatch,
        {"reply": "Noted.", "document": "pilot-agreement", "updates": {"provider": "Acme Ltd"}},
    )

    response = send(
        signed_in, documentId="pilot-agreement", values={"customer": "Umbrella"}
    ).json()

    assert response["values"] == {"customer": "Umbrella", "provider": "Acme Ltd"}


def test_an_unsupported_request_leaves_the_document_unchosen(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The assistant explains and offers the nearest thing; nothing starts."""
    stub(
        monkeypatch,
        {
            "reply": "I can't produce an employment contract. The closest I have is a "
            "Mutual NDA, if what you need is confidentiality.",
            "document": None,
        },
    )

    response = send(signed_in, documentId=None).json()

    assert response["documentId"] is None
    assert response["values"] == {}


def test_a_document_id_the_catalogue_does_not_have_is_refused(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The schema should make this impossible; it would otherwise mean drafting
    from a template that does not exist."""
    stub(monkeypatch, {"reply": "Here you go.", "document": "employment-contract"})

    response = send(signed_in, documentId=None).json()

    assert response["documentId"] is None


def test_a_stale_document_id_from_the_browser_is_ignored(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    stub(monkeypatch, {"reply": "ok", "document": None})

    response = send(signed_in, documentId="not-a-document").json()

    assert response["documentId"] is None


@pytest.mark.parametrize(
    "document_id",
    [d.id for d in load_catalogue(Settings().documents_path, Settings().fields_path)],
)
def test_every_document_can_be_chosen_and_holds_a_value(
    signed_in: TestClient, monkeypatch: pytest.MonkeyPatch, document_id: str
) -> None:
    """Each of the eleven, end to end through the endpoint."""
    catalogue = load_catalogue(Settings().documents_path, Settings().fields_path)
    document = next(d for d in catalogue if d.id == document_id)
    first = document.fields[0]

    stub(monkeypatch, {"reply": "ok", "document": document_id, "updates": {first.name: "Acme Ltd"}})

    response = send(signed_in, documentId=document_id, values={}).json()

    assert response["documentId"] == document_id
    if first.enum is None and first.type == "string":
        assert response["values"][first.name] == "Acme Ltd"

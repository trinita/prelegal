"""Saving documents, listing them, and reopening them.

Named for the saved rows rather than the catalogue: `test_documents.py` already
covers `documents.json` and the templates behind it, which is a different thing
entirely.
"""

from fastapi.testclient import TestClient

from app.documents import titles_for
from app.models import SavedDocument


def start(client: TestClient, document_type: str = "mutual-nda"):
    return client.post("/api/documents", json={"documentType": document_type})


def test_a_new_document_starts_empty(signed_in: TestClient) -> None:
    response = start(signed_in)

    assert response.status_code == 201
    body = response.json()
    assert body["documentType"] == "mutual-nda"
    assert body["values"] == {}
    assert body["transcript"] == []
    assert body["title"] == "Mutual Non-Disclosure Agreement"


def test_a_document_type_the_templates_do_not_have_is_refused(
    signed_in: TestClient,
) -> None:
    assert start(signed_in, "lease-for-a-narrowboat").status_code == 422


def test_values_are_saved_and_come_back(signed_in: TestClient) -> None:
    document = start(signed_in).json()

    saved = signed_in.put(
        f"/api/documents/{document['id']}",
        json={"values": {"governingLaw": "Delaware"}},
    )

    assert saved.status_code == 200
    assert saved.json()["values"] == {"governingLaw": "Delaware"}
    reopened = signed_in.get(f"/api/documents/{document['id']}")
    assert reopened.json()["values"] == {"governingLaw": "Delaware"}


def test_the_transcript_is_saved_so_the_conversation_can_be_resumed(
    signed_in: TestClient,
) -> None:
    document = start(signed_in).json()
    turns = [
        {"role": "assistant", "content": "What are you drafting?"},
        {"role": "user", "content": "An NDA with Initech."},
    ]

    signed_in.put(f"/api/documents/{document['id']}", json={"transcript": turns})

    assert signed_in.get(f"/api/documents/{document['id']}").json()["transcript"] == turns


def test_saving_values_leaves_the_transcript_alone(signed_in: TestClient) -> None:
    """The chat and the form save different halves, and neither sends the other."""
    document = start(signed_in).json()
    turns = [{"role": "user", "content": "An NDA."}]
    signed_in.put(f"/api/documents/{document['id']}", json={"transcript": turns})

    signed_in.put(
        f"/api/documents/{document['id']}", json={"values": {"jurisdiction": "Kent"}}
    )

    reopened = signed_in.get(f"/api/documents/{document['id']}").json()
    assert reopened["transcript"] == turns
    assert reopened["values"] == {"jurisdiction": "Kent"}


def test_a_save_with_nothing_in_it_is_rejected(signed_in: TestClient) -> None:
    document = start(signed_in).json()

    assert signed_in.put(f"/api/documents/{document['id']}", json={}).status_code == 422


def test_the_list_holds_what_this_person_has_drafted(signed_in: TestClient) -> None:
    start(signed_in, "mutual-nda")
    start(signed_in, "pilot-agreement")

    listed = signed_in.get("/api/documents").json()

    assert {row["documentType"] for row in listed} == {"mutual-nda", "pilot-agreement"}


def test_the_most_recently_worked_on_document_comes_first(
    signed_in: TestClient,
) -> None:
    first = start(signed_in, "mutual-nda").json()
    start(signed_in, "pilot-agreement")

    signed_in.put(f"/api/documents/{first['id']}", json={"values": {"a": "b"}})

    assert signed_in.get("/api/documents").json()[0]["id"] == first["id"]


def test_starting_over_leaves_the_earlier_document_in_the_list(
    signed_in: TestClient,
) -> None:
    """"Start over" begins a new document; it does not discard the old one."""
    first = start(signed_in).json()
    second = start(signed_in).json()

    listed = {row["id"] for row in signed_in.get("/api/documents").json()}

    assert listed == {first["id"], second["id"]}


def test_a_second_document_of_the_same_kind_is_numbered(signed_in: TestClient) -> None:
    start(signed_in, "mutual-nda")
    start(signed_in, "mutual-nda")

    titles = {row["title"] for row in signed_in.get("/api/documents").json()}

    assert titles == {
        "Mutual Non-Disclosure Agreement",
        "Mutual Non-Disclosure Agreement (2)",
    }


def test_another_persons_document_is_not_found(
    signed_in: TestClient, sign_up_another
) -> None:
    """Not "forbidden": that would confirm the document exists."""
    document = start(signed_in).json()

    sign_up_another()

    assert signed_in.get(f"/api/documents/{document['id']}").status_code == 404


def test_another_persons_document_cannot_be_written_to(
    signed_in: TestClient, sign_up_another
) -> None:
    document = start(signed_in).json()

    sign_up_another()
    written = signed_in.put(
        f"/api/documents/{document['id']}", json={"values": {"owned": "by me now"}}
    )

    assert written.status_code == 404


def test_the_list_holds_nobody_elses_documents(
    signed_in: TestClient, sign_up_another
) -> None:
    start(signed_in)

    sign_up_another()

    assert signed_in.get("/api/documents").json() == []


def test_a_document_that_never_existed_is_not_found(signed_in: TestClient) -> None:
    assert signed_in.get("/api/documents/4242").status_code == 404


def test_saved_documents_are_private_to_signed_in_users(client: TestClient) -> None:
    assert client.get("/api/documents").status_code == 401
    assert client.post("/api/documents", json={"documentType": "mutual-nda"}).status_code == 401
    assert client.get("/api/documents/1").status_code == 401
    assert client.put("/api/documents/1", json={"values": {}}).status_code == 401


def test_titles_fall_back_when_the_catalogue_has_dropped_a_document() -> None:
    """A saved document whose type the catalogue no longer lists still lists."""
    orphan = SavedDocument(id=1, owner_id=1, document_type="withdrawn", values={})

    assert titles_for([orphan], ()) == {1: "Document"}

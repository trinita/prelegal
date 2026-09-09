"""The database is meant to be temporary; these pin that behaviour down."""

from fastapi.testclient import TestClient
from sqlalchemy import inspect

from app.config import Settings
from app.main import create_app
from tests.conftest import ACCOUNT


def test_starting_up_creates_every_table(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        tables = inspect(client.app.state.engine).get_table_names()

        assert {"users", "sessions", "documents"} <= set(tables)


def test_restarting_discards_accounts_and_their_documents(settings: Settings) -> None:
    """The ticket allows this, and the interface says so rather than pretending."""
    with TestClient(create_app(settings)) as client:
        client.post("/api/auth/signup", json=ACCOUNT)
        client.post("/api/documents", json={"documentType": "mutual-nda"})

    # A second app against the same file: the container coming back up.
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/auth/me").status_code == 401

        # The address is free again, so it lands on a fresh row.
        again = client.post("/api/auth/signup", json=ACCOUNT)
        assert again.json()["id"] == 1
        assert client.get("/api/documents").json() == []

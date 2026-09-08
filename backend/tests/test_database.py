"""The database is meant to be temporary; these pin that behaviour down."""

from fastapi.testclient import TestClient
from sqlalchemy import inspect

from app.config import Settings
from app.main import create_app


def test_starting_up_creates_the_users_table(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        engine = client.app.state.engine

        assert "users" in inspect(engine).get_table_names()


def test_restarting_discards_existing_data(settings: Settings) -> None:
    with TestClient(create_app(settings)) as client:
        client.post("/api/auth/login", json={"name": "Ada Lovelace"})

    # A second app against the same file: the container coming back up.
    with TestClient(create_app(settings)) as client:
        client.cookies.clear()

        assert client.get("/api/auth/me").status_code == 401
        # And the name is free again, so it lands on a fresh row.
        assert client.post("/api/auth/login", json={"name": "Ada"}).json()["id"] == 1

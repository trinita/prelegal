"""Each test gets an application backed by its own throwaway database."""

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.main import create_app


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        database_path=tmp_path / "prelegal.db",
        # Points at nothing, so the app under test serves the API alone and the
        # catch-all static mount never shadows a route.
        static_dir=tmp_path / "no-frontend-here",
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    # The context manager runs the lifespan handler, which builds the schema.
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture
def session_factory(client: TestClient) -> sessionmaker[Session]:
    """Sessions against the running app's database, for testing below the API."""
    return client.app.state.session_factory


#: The account most tests sign in as. Registering through the real endpoint is
#: what puts a usable session cookie in the client's jar; there is no shortcut
#: that mints one, because a test that forged its own would stop proving the
#: sign-in path works.
ACCOUNT = {
    "name": "Ada Lovelace",
    "email": "ada@example.com",
    "password": "correct horse battery",
}


@pytest.fixture
def signed_in(client: TestClient) -> TestClient:
    """A client with an account, already signed in."""
    client.post("/api/auth/signup", json=ACCOUNT)
    return client


@pytest.fixture
def sign_up_another(client: TestClient):
    """Registers a second person on the same client, and signs in as them.

    A second `TestClient` would not do: entering one runs the lifespan handler,
    which drops the schema, so the first user's documents would be gone before
    the test could ask whether they were reachable. Signing up here simply
    replaces the session cookie, which is exactly what a second person sitting
    down at the same browser would do.
    """

    def register(email: str = "grace@example.com") -> None:
        client.post(
            "/api/auth/signup",
            json={
                "name": "Grace Hopper",
                "email": email,
                "password": "nanoseconds are short",
            },
        )

    return register

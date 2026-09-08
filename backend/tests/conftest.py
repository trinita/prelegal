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

"""Request-scoped dependencies.

Both of these read what `create_app` put on `app.state`, so an application built
with its own settings - as every test is - really does answer from those
settings. Resolving them from a process-wide cache instead would quietly ignore
whatever a caller passed in, and the mismatch would only surface once a test
needed to override a value that actually mattered.
"""

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Iterator[Session]:
    """Yields a session scoped to one request."""
    session_factory: sessionmaker[Session] = request.app.state.session_factory
    with session_factory() as session:
        yield session

"""Request-scoped dependencies.

These read what `create_app` put on `app.state`, so an application built with
its own settings - as every test is - really does answer from those settings.
Resolving them from a process-wide cache instead would quietly ignore whatever a
caller passed in, and the mismatch would only surface once a test needed to
override a value that actually mattered.
"""

from collections.abc import Iterator

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.models import User
from app.sessions import current_user


def get_settings(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Iterator[Session]:
    """Yields a session scoped to one request."""
    session_factory: sessionmaker[Session] = request.app.state.session_factory
    with session_factory() as session:
        yield session


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    """The signed-in user, or a 401.

    Every protected route shares this rather than repeating the check. Before
    PL-10 there were two hand-written copies of it; a third was about to be
    written for saved documents, which is one more than a rule of this
    importance should ever be spelled out.
    """
    user = current_user(request, db, settings)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in"
        )
    return user

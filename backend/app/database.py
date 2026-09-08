"""Engine and schema lifecycle.

The database is temporary by design. PL-7 asks for a store that is created from
scratch every time the container comes up, so `reset_database` drops every table
and recreates it during start-up. That keeps the foundation honest: nothing here
is durable yet, and no migration tool is needed until it is.

The engine is built in the application factory rather than at import time so a
test can stand up an app against its own file without reaching into module
globals.
"""

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import Settings


class Base(DeclarativeBase):
    """Declarative base; every model subclasses this so `metadata` sees it."""


def build_engine(settings: Settings) -> Engine:
    settings.database_path.parent.mkdir(parents=True, exist_ok=True)
    # SQLite guards connections against cross-thread use, which FastAPI's
    # threadpool would otherwise trip over on sync endpoints.
    return create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},
    )


def reset_database(engine: Engine) -> None:
    """Discard any existing schema and data, then recreate the tables."""
    # Importing here registers the models on Base.metadata before create_all
    # reads it, without making this module import-cycle sensitive.
    from app import models  # noqa: F401

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)

"""Creating a user when two requests race for the same new name."""

import pytest
from sqlalchemy.orm import Session, sessionmaker

from app import users
from app.models import User


def test_an_existing_name_is_reused(session_factory: sessionmaker[Session]) -> None:
    with session_factory() as db:
        first = users.find_or_create_user(db, "Ada Lovelace")
        second = users.find_or_create_user(db, "Ada Lovelace")

    assert first.id == second.id


def test_a_name_created_after_the_lookup_is_reused_rather_than_raising(
    session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The losing side of the race must still land on the winner's row.

    Both requests look, find nothing, and try to insert. Rather than depend on
    the timing of real threads, this makes the lookup miss once while the row
    genuinely exists, so the insert hits the actual unique constraint and the
    recovery path runs for the real reason.
    """
    with session_factory() as winner:
        expected = users.find_or_create_user(winner, "Ada Lovelace").id

    real_lookup = users._lookup
    calls = {"count": 0}

    def lookup(db: Session, name: str) -> User | None:
        """Miss on the first call only, as the loser of the race would."""
        calls["count"] += 1
        if calls["count"] == 1:
            return None
        return real_lookup(db, name)

    monkeypatch.setattr(users, "_lookup", lookup)

    with session_factory() as loser:
        recovered = users.find_or_create_user(loser, "Ada Lovelace")

        assert recovered.id == expected

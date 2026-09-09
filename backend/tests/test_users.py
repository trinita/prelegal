"""Registering and authenticating, below the API."""

import pytest
from sqlalchemy.orm import Session, sessionmaker

from app import users
from app.security import verify_password


def test_registering_stores_a_hash_and_never_the_password(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as db:
        user = users.register_user(db, "Ada Lovelace", "ada@example.com", "a password")

        assert user.password_hash != "a password"
        assert verify_password("a password", user.password_hash)


def test_a_second_account_cannot_take_a_registered_address(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as db:
        users.register_user(db, "Ada Lovelace", "ada@example.com", "a password")

        with pytest.raises(users.EmailAlreadyRegistered):
            users.register_user(db, "Imposter", "ada@example.com", "another password")


def test_two_people_may_share_a_display_name(
    session_factory: sessionmaker[Session],
) -> None:
    """The address is the identity now; the name is only a label."""
    with session_factory() as db:
        first = users.register_user(db, "Ada", "ada@example.com", "a password")
        second = users.register_user(db, "Ada", "ada2@example.com", "a password")

        assert first.id != second.id


def test_a_simultaneous_registration_is_refused_rather_than_crashing(
    session_factory: sessionmaker[Session],
) -> None:
    """Two sign-ups for one address, interleaved.

    FastAPI runs these sync endpoints in a threadpool, so both can find the
    address free and both try to insert. The loser's commit hits the unique
    constraint; it should read as "that address is taken", not as a 500.
    """
    with session_factory() as winner, session_factory() as loser:
        # Both look first, and both find nothing.
        assert loser.query(users.User).filter_by(email="ada@example.com").count() == 0
        users.register_user(winner, "Ada Lovelace", "ada@example.com", "a password")

        with pytest.raises(users.EmailAlreadyRegistered):
            users.register_user(loser, "Ada Lovelace", "ada@example.com", "a password")


def test_authenticating_accepts_the_right_password(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as db:
        registered = users.register_user(db, "Ada", "ada@example.com", "a password")

        found = users.authenticate_user(db, "ada@example.com", "a password")

        assert found is not None and found.id == registered.id


def test_authenticating_refuses_a_wrong_password(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as db:
        users.register_user(db, "Ada", "ada@example.com", "a password")

        assert users.authenticate_user(db, "ada@example.com", "not it") is None


def test_authenticating_an_unknown_address_returns_nothing(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as db:
        assert users.authenticate_user(db, "nobody@example.com", "a password") is None


def test_an_unknown_address_still_costs_a_password_check(
    session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Otherwise the clock answers the question the message refuses to.

    Returning as soon as the address is not found makes an unknown address
    hundreds of times faster to reject than a known one with a wrong password,
    because only the second path pays for scrypt. The reply is identical either
    way; the time it takes is not, and that is enough to enumerate who has an
    account here.
    """
    checked: list[str] = []

    def counting_verify(password: str, encoded: str) -> bool:
        checked.append(encoded)
        return False

    monkeypatch.setattr(users, "verify_password", counting_verify)

    with session_factory() as db:
        users.register_user(db, "Ada", "ada@example.com", "a password")

        assert users.authenticate_user(db, "nobody@example.com", "a password") is None

        assert checked, "no password was verified, so the fast path leaks"

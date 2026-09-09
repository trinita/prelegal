"""Session tokens, below the API."""

from sqlalchemy.orm import Session, sessionmaker

from app import sessions, users
from app.models import AuthSession


def register(db: Session):
    return users.register_user(db, "Ada Lovelace", "ada@example.com", "a password")


def test_a_created_session_finds_its_user_back(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as db:
        user = register(db)

        token = sessions.create_session(db, user)

        found = sessions.find_user_by_token(db, token)
        assert found is not None and found.id == user.id


def test_the_raw_token_is_not_what_is_stored(
    session_factory: sessionmaker[Session],
) -> None:
    """A copy of this table should hand out no live sessions."""
    with session_factory() as db:
        token = sessions.create_session(db, register(db))

        stored = db.query(AuthSession).one().token_hash
        assert stored != token
        assert token not in stored


def test_a_token_nobody_issued_names_nobody(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as db:
        register(db)

        assert sessions.find_user_by_token(db, "invented") is None


def test_two_sign_ins_get_different_tokens(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as db:
        user = register(db)

        assert sessions.create_session(db, user) != sessions.create_session(db, user)


def test_deleting_a_session_ends_only_that_one(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as db:
        user = register(db)
        phone = sessions.create_session(db, user)
        laptop = sessions.create_session(db, user)

        sessions.delete_session(db, phone)

        assert sessions.find_user_by_token(db, phone) is None
        assert sessions.find_user_by_token(db, laptop) is not None


def test_deleting_a_token_that_is_not_there_is_harmless(
    session_factory: sessionmaker[Session],
) -> None:
    with session_factory() as db:
        register(db)

        sessions.delete_session(db, "never issued")


def test_deleting_a_user_takes_their_sessions_and_documents(
    session_factory: sessionmaker[Session],
) -> None:
    """Nothing deletes a user yet; the cascade is here so nothing is orphaned
    the first time something does."""
    from app.documents import create_document
    from app.models import SavedDocument

    with session_factory() as db:
        user = register(db)
        sessions.create_session(db, user)
        create_document(db, user, "mutual-nda")

        db.delete(user)
        db.commit()

        assert db.query(AuthSession).count() == 0
        assert db.query(SavedDocument).count() == 0

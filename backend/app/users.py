"""Looking users up, and creating them on first sight."""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import User


def _lookup(db: Session, name: str) -> User | None:
    return db.query(User).filter(User.name == name).one_or_none()


def find_or_create_user(db: Session, name: str) -> User:
    """The user with this name, created if this is the first time we see it.

    The obvious version - look, and insert if absent - has a gap between the two
    steps. FastAPI runs these sync endpoints in a threadpool, so two requests
    carrying the same new name can both find nothing and both try to insert;
    `User.name` is unique, so the slower one's commit raises. Catching that and
    reading the winner's row keeps the promise the login makes, which is that a
    given name always lands on the same account, rather than failing with a 500
    for whoever lost by a millisecond.
    """
    existing = _lookup(db, name)
    if existing is not None:
        return existing

    user = User(name=name)
    db.add(user)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Someone inserted this name while we were writing; theirs is the row.
        return _lookup_or_fail(db, name)

    db.refresh(user)
    return user


def _lookup_or_fail(db: Session, name: str) -> User:
    user = _lookup(db, name)
    if user is None:
        # The unique constraint fired, so the row exists. If it cannot be read
        # back, something is wrong that silence would only hide.
        raise RuntimeError(f"User {name!r} conflicted on insert but is not present")
    return user

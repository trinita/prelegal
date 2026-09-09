"""Registering users, and checking who they say they are."""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import User
from app.security import hash_password, verify_password

#: A real hash of a value nobody can sign in with, checked when the address is
#: unknown so that both outcomes cost the same scrypt derivation. Built once at
#: import rather than per request: hashing here would double the work, and the
#: point is to match what the other branch does, not to exceed it.
_ABSENT_USER_HASH = hash_password(
    "the password of no account; never matched because no user carries this hash"
)


class EmailAlreadyRegistered(Exception):
    """Raised when a sign-up names an address that already has an account."""


def _lookup(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).one_or_none()


def register_user(db: Session, name: str, email: str, password: str) -> User:
    """Creates an account, or refuses because the address is taken.

    The obvious version - look, then insert - has a gap between the two steps.
    FastAPI runs these sync endpoints in a threadpool, so two sign-ups for the
    same new address can both find nothing and both try to insert; `User.email`
    is unique, so the slower one's commit raises. Catching that turns a race
    into the same refusal the caller would have got a millisecond earlier,
    rather than a 500.

    PL-7's version of this function resolved the conflict by returning the
    existing row, which was right when a name was only a label. It would be
    quite wrong now: it would hand the account to whoever asked for it second.
    """
    if _lookup(db, email) is not None:
        raise EmailAlreadyRegistered(email)

    user = User(name=name, email=email, password_hash=hash_password(password))
    db.add(user)

    try:
        db.commit()
    except IntegrityError as conflict:
        db.rollback()
        raise EmailAlreadyRegistered(email) from conflict

    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    """The user with this address and password, or None.

    An unknown address and a wrong password are deliberately the same answer.
    Distinguishing them would turn the sign-in form into a way to ask which
    addresses have accounts here.

    Saying the same thing is not enough on its own: scrypt is deliberately slow,
    so returning early for an address that does not exist refused in
    microseconds what a real address with a wrong password took tens of
    milliseconds to refuse — measured at roughly 300 times faster. The message
    was identical and the clock was not, which left accounts enumerable anyway.
    The unknown branch therefore verifies against a hash belonging to nobody,
    and pays the same cost.
    """
    user = _lookup(db, email)
    if user is None:
        verify_password(password, _ABSENT_USER_HASH)
        return None
    return user if verify_password(password, user.password_hash) else None

"""Sessions, and the cookie that carries one.

This module replaces `app/session.py`, which held a plain user id and said
plainly that it was not authentication. What is in the cookie now is a random
128-bit token that means nothing on its own: it is looked up, by hash, in the
`sessions` table, and a value that is not there signs nobody in. Guessing one is
not a thing that happens.

The token is stored hashed rather than in the clear. SHA-256 with no salt or
stretching is the right tool here and a poor one for passwords - the input is
already high-entropy random, so there is nothing for an attacker to guess at,
and the per-request cost of a memory-hard hash would buy nothing.

Sessions live in the database, so they end when it does. That is the same
behaviour the fake login had after a restart, and it is honest: this product
throws its database away on every start and a session that outlived it would be
pointing at a user who no longer exists.
"""

from hashlib import sha256
from secrets import token_urlsafe

from fastapi import Request, Response
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import AuthSession, User

_TOKEN_BYTES = 32


def _fingerprint(raw_token: str) -> str:
    return sha256(raw_token.encode("utf-8")).hexdigest()


def create_session(db: Session, user: User) -> str:
    """Records a new session and returns the raw token for the cookie."""
    raw_token = token_urlsafe(_TOKEN_BYTES)
    db.add(AuthSession(token_hash=_fingerprint(raw_token), user_id=user.id))
    db.commit()
    return raw_token


def find_user_by_token(db: Session, raw_token: str) -> User | None:
    session = (
        db.query(AuthSession)
        .filter(AuthSession.token_hash == _fingerprint(raw_token))
        .one_or_none()
    )
    return None if session is None else session.user


def delete_session(db: Session, raw_token: str) -> None:
    """Ends this session. Signing out of one browser leaves the others alone."""
    db.query(AuthSession).filter(
        AuthSession.token_hash == _fingerprint(raw_token)
    ).delete()
    db.commit()


def start_session(
    response: Response, user: User, db: Session, settings: Settings
) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=create_session(db, user),
        httponly=True,
        samesite="lax",
        path="/",
        max_age=settings.session_max_age_seconds,
    )


def end_session(
    request: Request, response: Response, db: Session, settings: Settings
) -> None:
    """Clears the cookie *and* the row, so the token is dead either way.

    Deleting only the cookie would leave a token that still works to anyone who
    had captured it - a sign-out that logs the user out of the interface but not
    out of the system.
    """
    raw_token = request.cookies.get(settings.session_cookie_name)
    if raw_token is not None:
        delete_session(db, raw_token)
    response.delete_cookie(key=settings.session_cookie_name, path="/")


def current_user(request: Request, db: Session, settings: Settings) -> User | None:
    """The user this request's cookie names, or None.

    An absent, unknown, expired or forged cookie all read the same way: signed
    out. That is also what every browser holds after a restart, since the table
    behind it was dropped.
    """
    raw_token = request.cookies.get(settings.session_cookie_name)
    if raw_token is None:
        return None
    return find_user_by_token(db, raw_token)

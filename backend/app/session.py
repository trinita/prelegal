"""The stand-in for authentication.

PL-7 asks for a fake login: a screen that takes a name and brings the user into
the platform, with real credentials deferred to a later ticket. This module is
that stand-in. It puts the signed-in user's id in a cookie, and reads it back.

**This is not authentication.** The cookie value is a plain integer, unsigned
and unverified, so anyone can set it by hand and become any user. That is
deliberate. A fake session dressed up with a signature would invite the next
person to trust it; one that is obviously forgeable cannot be mistaken for the
real thing. PL-10 replaces the whole module with password checking and signed
tokens.
"""

from fastapi import Request, Response
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import User


def start_session(response: Response, user: User, settings: Settings) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=str(user.id),
        httponly=True,
        samesite="lax",
        path="/",
    )


def end_session(response: Response, settings: Settings) -> None:
    response.delete_cookie(key=settings.session_cookie_name, path="/")


def current_user(request: Request, db: Session, settings: Settings) -> User | None:
    """The user named by the session cookie, or None if there isn't one.

    A cookie naming a user who no longer exists - the usual case after a
    restart, since the database is rebuilt each time - reads as signed out
    rather than as an error.
    """
    raw = request.cookies.get(settings.session_cookie_name)
    if raw is None:
        return None
    try:
        user_id = int(raw)
    except ValueError:
        return None
    return db.get(User, user_id)

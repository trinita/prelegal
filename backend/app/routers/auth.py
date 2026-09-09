"""Registering, signing in, and signing out.

PL-10 replaces PL-7's fake login. An account is an email address and a password
now, the password is checked against a stored scrypt hash, and the cookie
carries a random session token rather than a user id anyone could type.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import Settings
from app.dependencies import get_current_user, get_db, get_settings
from app.models import User
from app.schemas import LoginRequest, SignUpRequest, UserResponse
from app.sessions import end_session, start_session
from app.users import EmailAlreadyRegistered, authenticate_user, register_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

#: Said for a wrong password and for an address with no account alike. Which of
#: the two it was is not something the form should be willing to report.
_REJECTED = "Incorrect email or password"


@router.post("/signup", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def sign_up(
    payload: SignUpRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    try:
        user = register_user(db, payload.name, payload.email, payload.password)
    except EmailAlreadyRegistered as taken:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account already exists for that email address",
        ) from taken

    # Registering signs you in: making someone type the password they just
    # chose, twice, teaches them nothing about their new account.
    start_session(response, user, db, settings)
    return user


@router.post("/login", response_model=UserResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    user = authenticate_user(db, payload.email, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=_REJECTED
        )

    start_session(response, user, db, settings)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> None:
    # Deliberately not behind get_current_user: signing out when the session has
    # already gone should clear the cookie, not fail with a 401.
    end_session(request, response, db, settings)


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)) -> User:
    return user

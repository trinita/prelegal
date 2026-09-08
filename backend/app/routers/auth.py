"""Sign-in endpoints for the fake login.

There is no password and no verification: whatever name is submitted is either
matched to an existing user or turned into a new one. See `app.session` for why
that is the intended behaviour at this stage.
"""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.config import Settings
from app.dependencies import get_db, get_settings
from app.models import User
from app.schemas import LoginRequest, UserResponse
from app.session import current_user, end_session, start_session
from app.users import find_or_create_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=UserResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    user = find_or_create_user(db, payload.name)
    start_session(response, user, settings)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    settings: Settings = Depends(get_settings),
) -> None:
    end_session(response, settings)


@router.get("/me", response_model=UserResponse)
def me(
    request: Request,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> User:
    user = current_user(request, db, settings)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in"
        )
    return user

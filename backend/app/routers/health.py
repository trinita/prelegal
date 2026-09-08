"""Liveness check, used by the container healthcheck and the start scripts."""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.schemas import HealthResponse

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(db: Session = Depends(get_db)) -> HealthResponse:
    # Touch the database so the check fails if the schema was never built,
    # rather than reporting a healthy process in front of a broken store.
    db.execute(text("SELECT 1"))
    return HealthResponse(status="ok", database="ok")

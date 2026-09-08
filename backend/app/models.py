"""Database models.

Only `User` exists so far. PL-7 stops at a fake login, so the row carries a
display name and nothing else; the email address and password hash that real
authentication needs arrive with PL-10.
"""

from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    #: Unique so that typing the same name again returns to the same account,
    #: which is what makes the fake login feel like signing back in.
    name: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

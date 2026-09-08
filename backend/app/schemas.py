"""Request and response bodies."""

from pydantic import BaseModel, ConfigDict, Field, field_validator


class LoginRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def strip_and_require_content(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Name must not be blank")
        return stripped


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class HealthResponse(BaseModel):
    status: str
    database: str

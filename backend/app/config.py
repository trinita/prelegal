"""Runtime configuration.

Every setting is overridable through a `PRELEGAL_`-prefixed environment
variable, which is how the Docker image points the app at the built frontend
and at a database path inside the container.
"""

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="PRELEGAL_",
        extra="ignore",
        # Convenient locally; in the container the key is passed as an
        # environment variable, since .env never enters the image.
        env_file=BACKEND_DIR.parent / ".env",
    )

    #: Where the temporary SQLite file lives. Deliberately not a mounted
    #: volume: the database is rebuilt from scratch on every start.
    database_path: Path = BACKEND_DIR / "data" / "prelegal.db"

    #: The built frontend. Absent during local `npm run dev`, in which case the
    #: backend serves the API alone and Next.js serves the pages on :3000.
    static_dir: Path = BACKEND_DIR / "static"

    #: Origins allowed to call the API with credentials. Only needed for the
    #: split dev setup; in the container the frontend is same-origin.
    dev_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    session_cookie_name: str = "prelegal_session"

    #: How long a session cookie is offered for. The session itself dies
    #: with the database on the next restart, whichever comes first.
    session_max_age_seconds: int = 60 * 60 * 24 * 30

    #: The shared definition of the document's fields, read by the AI and
    #: tested against the frontend's copy.
    fields_path: Path = BACKEND_DIR.parent / "mnda-fields.json"

    #: The other ten documents, described by the terms their Standard Terms
    #: reference.
    documents_path: Path = BACKEND_DIR.parent / "documents.json"

    #: Pinned by CLAUDE.md: LiteLLM to OpenRouter, gpt-oss-120b, on Cerebras.
    ai_model: str = "openrouter/openai/gpt-oss-120b"
    ai_provider: str = "cerebras"
    ai_timeout_seconds: float = 60.0

    #: Read from OPENROUTER_API_KEY, which is what the project's .env calls it,
    #: as well as the prefixed name every other setting uses.
    openrouter_api_key: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "OPENROUTER_API_KEY", "PRELEGAL_OPENROUTER_API_KEY"
        ),
    )

    #: Bounds on one request, so a long or crafted conversation cannot run up an
    #: unbounded bill.
    max_history_messages: int = 40
    max_message_characters: int = 4000

    #: Longest value the assistant may write into a single field.
    max_field_characters: int = 1000

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.database_path}"


@lru_cache
def get_settings() -> Settings:
    return Settings()

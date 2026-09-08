"""Runtime configuration.

Every setting is overridable through a `PRELEGAL_`-prefixed environment
variable, which is how the Docker image points the app at the built frontend
and at a database path inside the container.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PRELEGAL_", extra="ignore")

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

    @property
    def database_url(self) -> str:
        return f"sqlite:///{self.database_path}"


@lru_cache
def get_settings() -> Settings:
    return Settings()

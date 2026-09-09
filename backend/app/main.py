"""Application entry point.

The container runs one process: FastAPI serves the JSON API under `/api` and
the statically exported frontend at everything else, which is why the whole
product is reachable on http://localhost:8000.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import sessionmaker

from app.config import Settings, get_settings
from app.database import build_engine, reset_database
from app.routers import auth, chat, documents, health

logger = logging.getLogger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = build_engine(settings)
        reset_database(engine)
        logger.info("Database created at %s", settings.database_path)

        # Published for the request-scoped dependencies in app.dependencies,
        # so routers see this application's settings rather than a global.
        app.state.settings = settings
        app.state.engine = engine
        app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
        yield
        engine.dispose()

    app = FastAPI(
        title="Prelegal",
        description="Draft legal agreements from Common Paper templates.",
        version="0.1.0",
        lifespan=lifespan,
    )

    # Only matters when the frontend runs separately on :3000; in the container
    # it is served from this same origin and no preflight ever happens.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.dev_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(chat.router)
    app.include_router(documents.router)

    # Mounted last: a mount at "/" matches every path, so the API routes above
    # must be registered first to keep their claim on /api.
    if settings.static_dir.is_dir():
        app.mount(
            "/",
            StaticFiles(directory=settings.static_dir, html=True),
            name="frontend",
        )
    else:
        logger.warning(
            "No built frontend at %s; serving the API only. "
            "Run `npm run dev` in frontend/ for the pages.",
            settings.static_dir,
        )

    return app


app = create_app()

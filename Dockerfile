# The whole product in one image: the frontend is compiled to static files by
# Node, then handed to the Python stage, which serves it alongside the API. One
# process, one port, nothing to wire up at run time.

# --- stage 1: build the frontend ------------------------------------------
FROM node:24-alpine AS frontend

WORKDIR /build/frontend

# Dependencies first, so editing application code does not reinstall them.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# sync-templates reads ../templates, so the dataset has to sit beside the app
# exactly as it does in the repository.
COPY templates /build/templates
COPY frontend ./

RUN npm run build

# --- stage 2: serve --------------------------------------------------------
FROM python:3.12-slim AS runtime

COPY --from=ghcr.io/astral-sh/uv:0.12.10 /uv /usr/local/bin/uv

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PYTHONUNBUFFERED=1

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev

COPY backend/app ./app
COPY --from=frontend /build/frontend/out ./static

# The shared field schema: the backend reads it to build the assistant's
# structured-output contract, and the frontend is tested against the same file.
COPY mnda-fields.json ./mnda-fields.json

ENV PATH="/app/.venv/bin:$PATH" \
    PRELEGAL_STATIC_DIR=/app/static \
    PRELEGAL_DATABASE_PATH=/app/data/prelegal.db \
    PRELEGAL_FIELDS_PATH=/app/mnda-fields.json

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

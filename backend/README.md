# Prelegal backend

FastAPI over SQLite, packaged with [uv](https://docs.astral.sh/uv/). In the
container it does two jobs: it answers the JSON API under `/api`, and it serves
the frontend's static build for everything else — which is why the whole product
lives on http://localhost:8000 rather than on two ports.

Implements [PL-7](https://trinitadewanti.atlassian.net/browse/PL-7).

## Running it

The normal way is the container, from the repository root:

```bash
scripts/start-mac.sh        # or start-linux.sh, start-windows.ps1
```

To work on the backend alone, with the frontend on its own dev server:

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload    # http://localhost:8000
uv run pytest
```

With no built frontend present the app logs a warning and serves the API only —
which is the right behaviour for that split setup, where Next.js serves the
pages on :3000 and calls across to :8000.

## Layout

| Path | What it does |
| --- | --- |
| `app/main.py` | Application factory: lifespan, CORS, routers, static mount |
| `app/config.py` | Settings, all overridable by `PRELEGAL_*` environment variables |
| `app/database.py` | Engine and the drop-and-recreate on start-up |
| `app/dependencies.py` | The request-scoped session and settings |
| `app/models.py` | SQLAlchemy models — just `User` so far |
| `app/schemas.py` | Request and response bodies |
| `app/session.py` | The fake session (read the docstring) |
| `app/users.py` | Finding a user by name, and creating one on first sight |
| `app/routers/` | `auth.py` and `health.py` |

The engine is built inside `create_app` rather than at import time, and both the
engine and the settings are published on `app.state`, so everything a request
touches comes from the application it belongs to. A test can therefore stand up
an app against its own database file, with its own settings, without patching
globals — and `tests/test_auth.py` holds that guarantee in place by giving one
app a non-default cookie name.

## The database is temporary

`reset_database` drops every table and recreates it during start-up, so each
container start begins empty and nothing is carried over. There is no migration
tool because there is nothing to migrate: while the schema is still moving, a
guaranteed-clean start is worth more than durable data. Whichever ticket
introduces data worth keeping is the one that should add Alembic and a volume.

## The login is not authentication

`POST /api/auth/login` takes a name, finds or creates that user, and sets a
cookie holding their id. Nothing is verified. The cookie is unsigned, so anyone
can set it by hand and become any user.

This is deliberate: PL-7 asks for a fake login, and a fake session carrying a
real-looking signature would invite the next reader to trust it. PL-10 replaces
`app/session.py` wholesale with password checking and signed tokens.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PRELEGAL_DATABASE_PATH` | `backend/data/prelegal.db` | Where the temporary SQLite file goes |
| `PRELEGAL_STATIC_DIR` | `backend/static` | The built frontend; skipped if absent |
| `PRELEGAL_DEV_ORIGINS` | `["http://localhost:3000", "http://127.0.0.1:3000"]` | Origins allowed to call the API with credentials |
| `PRELEGAL_SESSION_COOKIE_NAME` | `prelegal_session` | Session cookie name |

## Tests

```bash
uv run pytest
```

16 tests covering the fake login, the session cookie's edge cases — a cookie
naming a user who no longer exists, a malformed one — the two properties the
database is supposed to have (the schema exists after start-up, and a restart
discards what came before), and the race two simultaneous first-time logins
under the same name would otherwise lose.

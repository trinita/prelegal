# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

Only the Mutual NDA is wired up so far, filled in by chatting with an assistant. The remaining document types and real authentication are still to build — see Implementation Status at the end of this file for what is actually in the repository.

## Development process

When instructed to build a feature:
1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

The key is `OPENROUTER_API_KEY`, in the `.env` file in the project root. `.env` is git-ignored and is not copied into the Docker image, so the container will need it passed in as an environment variable once there is code that reads it. The backend reads it in `app/ai/client.py`; nothing else calls an LLM.

## Technical design

The entire project should be packaged into a Docker container.  
The backend should be in backend/ and be a uv project, using FastAPI.  
The frontend should be in frontend/  
The database should use SQLLite and be created from scratch each time the Docker container is brought up, allowing for a users table with sign up and sign in.  
The frontend is statically exported and served by FastAPI — this was tried in PL-7 and works, because every page renders in the browser.  
There should be scripts in scripts/ for:  
```bash
# Mac
scripts/start-mac.sh    # Start
scripts/stop-mac.sh     # Stop

# Linux
scripts/start-linux.sh
scripts/stop-linux.sh

# Windows
scripts/start-windows.ps1
scripts/stop-windows.ps1
```
Backend available at http://localhost:8000

## Color Scheme
- Accent Yellow: `#ecad0a`
- Blue Primary: `#209dd7`
- Purple Secondary: `#753991` (submit buttons)
- Dark Navy: `#032147` (headings)
- Gray Text: `#888888`

## Implementation Status

This section records what is actually in the repository. Anything not listed
here has not been built yet.

### Completed (PL-5)
- The twelve Common Paper templates curated into `templates/`, described by `catalog.json`

### Completed (PL-6)
- Mutual NDA creator: form → live document → print to PDF, entirely in the browser
- Document generation covered by a Vitest suite in `frontend/src/lib/`

### Completed (PL-7) — foundation for V1
- Docker multi-stage build (Node builds the frontend, Python serves everything)
- FastAPI backend in `backend/`, a uv project, with SQLAlchemy over SQLite
- The database is dropped and recreated on every start, so nothing in it is durable
- Next.js static export served by FastAPI, so the whole product is on http://localhost:8000
- **Fake login only.** A name is exchanged for a session cookie; there are no
  passwords, the cookie is unsigned, and anyone can forge it. See
  `backend/app/session.py`. Real authentication is PL-10.
- Start and stop scripts for Mac, Linux and Windows
- The NDA creator itself is unchanged, now behind the login
- 16 backend tests and 85 frontend tests at the time

### Current API Endpoints
- `POST /api/auth/login` — exchange a name for a session (creates the user if new)
- `POST /api/auth/logout` — clear the session cookie
- `GET /api/auth/me` — the signed-in user, or 401
- `GET /api/health` — health check, used by the container healthcheck and start scripts

### Completed (PL-8) — AI chat
- Freeform chat with an assistant that asks about the document and fills it in
- LiteLLM → OpenRouter → `openai/gpt-oss-120b`, provider pinned to Cerebras,
  using Structured Outputs
- `mnda-fields.json` at the repository root is the shared definition of the
  document's fields; the frontend is tested against it so the two cannot drift
- The manual form remains behind an *Edit fields* tab, for corrections and for
  clearing values
- Without `OPENROUTER_API_KEY` the chat reports itself unavailable and the rest
  of the product still works
- `POST /api/chat/message` requires a session, since each message costs money
- Values the user has not spoken to are offered for confirmation, never
  assumed: the template's defaults would otherwise be read as answers
- 55 backend tests and 104 frontend tests

### Planned
- **PL-9** — all 11 document types from `catalog.json`, with the AI routing to
  the right one
- **PL-10** — real authentication (email, password hashing, tokens) and document
  persistence per user

## Repository layout

| Path | Contents |
| --- | --- |
| `templates/` | Agreement templates, verbatim from Common Paper. Never edit generated copies instead. |
| `catalog.json` | Name, description, filename and source repo for each template |
| `backend/` | uv project: FastAPI, SQLAlchemy over SQLite, serves the API and the built frontend |
| `frontend/` | Next.js app, statically exported to `out/` at build time |
| `scripts/` | Start and stop, per platform; the four shell scripts share `scripts/_compose.sh` |
| `mnda-fields.json` | The document's fields, shared by the form and the AI |
| `Dockerfile` | Multi-stage: Node compiles the frontend, Python serves it |

Each half has its own README covering architecture and tests.

## Running and testing

```bash
scripts/start-mac.sh              # whole product on http://localhost:8000
scripts/stop-mac.sh

cd backend  && uv run pytest      # 55 tests
cd frontend && npm test           # 104 tests
```

For frontend work, `npm run dev` serves pages on :3000 and calls the API on
:8000 by default, so run `uv run uvicorn app.main:app --reload` alongside it.
There is nothing to configure.

## Constraints worth knowing before changing things

- **The login is not authentication.** A name is exchanged for an unsigned,
  forgeable cookie. This is deliberate and documented in
  `backend/app/session.py`; PL-10 replaces that module. Do not build anything
  that treats the session as a security boundary.
- **The database does not survive a restart.** Every start drops the schema and
  recreates it, and no volume is mounted. Whichever ticket introduces data worth
  keeping should add Alembic and a volume at the same time.
- **The legal text is the product.** `templates/` is the single source of truth;
  `frontend/src/templates/sources.ts` is generated at build time and git-ignored.
  Change wording in `templates/` only.
- **New tests must be shown failing first.** Two tests written for this project
  passed against broken code until they were checked that way. Mutate the code,
  confirm the test fails for the right reason, then restore.

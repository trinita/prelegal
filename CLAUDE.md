# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

The current implementation supports all 11 document types via AI chat with full user authentication and document persistence.

## Development process

When instructed to build a feature:
1. Use your Atlassian tools to read the feature instructions from Jira
2. Develop the feature - do not skip any step from the feature-dev 7 step process
3. Thoroughly test the feature with unit tests and integration tests and fix any issues
4. Submit a PR using your github tools

## AI design

When writing code to make calls to LLMs, use your Cerebras skill to use LiteLLM via OpenRouter to the `openrouter/openai/gpt-oss-120b` model with Cerebras as the inference provider. You should use Structured Outputs so that you can interpret the results and populate fields in the legal document.

There is an OPEN_API_KEY in the .env file in the project root.

## Technical design

The entire project should be packaged into a Docker container.  
The backend should be in backend/ and be a uv project, using FastAPI.  
The frontend should be in frontend/  
The database should use SQLLite and be created from scratch each time the Docker container is brought up, allowing for a users table with sign up and sign in.  
Consider statically building the frontend and serving it via FastAPI, if that will work.  
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
- 16 backend tests and 85 frontend tests

### Current API Endpoints
- `POST /api/auth/login` — exchange a name for a session (creates the user if new)
- `POST /api/auth/logout` — clear the session cookie
- `GET /api/auth/me` — the signed-in user, or 401
- `GET /api/health` — health check, used by the container healthcheck and start scripts

### Planned
- **PL-8** — AI chat replaces the manual form for NDA creation, using LiteLLM
  via OpenRouter with Cerebras inference and structured outputs
- **PL-9** — all 11 document types from `catalog.json`, with the AI routing to
  the right one
- **PL-10** — real authentication (email, password hashing, tokens) and document
  persistence per user

# Prelegal Project

## Overview

This is a SaaS product to allow users to draft legal agreements based on templates in the templates directory.
The user can carry out AI chat in order to establish what document they want and how to fill in the fields.
The available documents are covered in the catalog.json file in the project root, included here:

@catalog.json

All eleven document types are supported, filled in by chatting with an assistant. Accounts are real as of PL-10, and each user's documents are saved for as long as the server runs — see Implementation Status at the end of this file for what is actually in the repository.

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
  passwords, the cookie is unsigned, and anyone can forge it. Superseded by
  PL-10: `backend/app/session.py` no longer exists, and `backend/app/sessions.py`
  replaced it.
- Start and stop scripts for Mac, Linux and Windows
- The NDA creator itself is unchanged, now behind the login
- 16 backend tests and 85 frontend tests at the time

### Current API Endpoints
- `POST /api/auth/signup` — register, and sign in
- `POST /api/auth/login` — email and password for a session
- `POST /api/auth/logout` — delete the session and clear the cookie
- `GET /api/auth/me` — the signed-in user, or 401
- `GET /api/documents` — this user's documents, most recently updated first
- `POST /api/documents` — start one, by catalogue document type
- `GET /api/documents/{id}` — one document, with its values and transcript
- `PUT /api/documents/{id}` — save values, transcript, or both
- `POST /api/chat/message` — one turn of the conversation
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

### Completed (PL-9) — every document type
- All eleven templates from `catalog.json` can be drafted
- The assistant works out which document is needed from a plain description, and
  says plainly when it cannot produce one, offering the nearest it can
- Only the Mutual NDA has a published cover page; for the other ten the app
  generates the key terms page their clauses reference and appends the standard
  terms verbatim
- `documents.json` defines those ten and is checked against the templates in
  both directions, so the catalogue cannot drift from the legal text
- Choosing or changing a document starts it empty: one agreement's answers are
  not another's
- 77 backend tests and 213 frontend tests

### Completed (PL-10) — accounts, saved documents, and polish
- Real sign-up and sign-in: email and password, hashed with `hashlib.scrypt`
- The session cookie holds a random token, looked up by SHA-256 hash in a
  `sessions` table. Signing out deletes the row, so it revokes rather than only
  clearing the cookie
- **No new backend dependency.** Both the hashing and the session mechanism come
  from the standard library, keeping the backend at five runtime dependencies
- Every document is saved to the account that made it, automatically: a row is
  created when the assistant settles on a document, and values and transcript
  are written after 800ms of quiet
- *Your documents* lists them, most recently worked on first. Opening one
  restores its values **and its conversation**, so the assistant still knows what
  was said
- A draft disclaimer is rendered into the document itself, so it survives to the
  PDF — the same mechanism as the CC BY modification notice, and equally never
  written into the Standard Terms
- The application chrome now uses the project's palette; `--accent` was
  `#1f4b8f`, a colour in no part of the brand
- The local draft is cleared on every change of signed-in user, and signing in
  lands on the documents list. Without both, one person's half-typed agreement
  was waiting for the next person on a shared browser
- **The database is still dropped on every start**, as the ticket allows. The
  sign-in screen and the documents list both say so
- 121 backend tests and 279 frontend tests

### Planned
- Durable storage: whichever ticket makes saved documents outlive a restart is
  the one that should add Alembic and a volume

## Repository layout

| Path | Contents |
| --- | --- |
| `templates/` | Agreement templates, verbatim from Common Paper. Never edit generated copies instead. |
| `catalog.json` | Name, description, filename and source repo for each template |
| `backend/` | uv project: FastAPI, SQLAlchemy over SQLite, serves the API and the built frontend |
| `frontend/` | Next.js app, statically exported to `out/` at build time |
| `scripts/` | Start and stop, per platform; the four shell scripts share `scripts/_compose.sh` |
| `mnda-fields.json` | The Mutual NDA's cover page fields, shared by the form and the AI |
| `documents.json` | The other ten documents, and the terms their clauses reference |
| `Dockerfile` | Multi-stage: Node compiles the frontend, Python serves it |

Each half has its own README covering architecture and tests.

## Running and testing

```bash
scripts/start-mac.sh              # whole product on http://localhost:8000
scripts/stop-mac.sh

cd backend  && uv run pytest      # 121 tests
cd frontend && npm test           # 279 tests
```

For frontend work, `npm run dev` serves pages on :3000 and calls the API on
:8000 by default, so run `uv run uvicorn app.main:app --reload` alongside it.
There is nothing to configure.

## Constraints worth knowing before changing things

- **The session is a real one, but the store is not durable.** PL-10 replaced
  `app/session.py` with `app/sessions.py`: a random token, stored hashed, that
  cannot be forged by hand. It is still a session in a database that is dropped
  on every start, so everyone is signed out by a restart.
- **The database does not survive a restart.** Every start drops the schema and
  recreates it, and no volume is mounted. PL-10 was allowed to save documents
  into it anyway, on the ticket's own terms; the interface says so in two places
  rather than implying a durability that is not there. Whichever ticket makes
  that data worth keeping should add Alembic and a volume at the same time.
- **Never fetch a saved document by id alone.** `app/documents.py` filters on the
  owner inside the query, and offers no function that does not, so a route
  cannot forget. Another user's document must read as 404, never 403: a 403
  confirms the row exists.
- **Both sign-in branches must hash a password.** `authenticate_user` verifies
  against `_ABSENT_USER_HASH` when the address is unknown. Without it the reply
  is identical but the timing is not — an unknown address was refused about 300
  times faster than a real one with a wrong password, which enumerates accounts
  just as well as a different error message would.
- **A debounced save is flushed on unmount, never cancelled.** Leaving the
  editor within the 800ms window is exactly when an edit is still pending;
  cancelling discards it, and reopening the document then fetches the older
  version back from the server without a word.
- **The legal text is the product.** `templates/` is the single source of truth;
  `frontend/src/templates/sources.ts` is generated at build time and git-ignored.
  Change wording in `templates/` only.
- **Never substitute a value into Standard Terms.** Those clauses are written to
  read with the defined term — "during the Pilot Period" — so putting the value
  there breaks sentences and alters the legal wording. Values belong on the
  cover page or the generated key terms page. The same holds for the draft
  disclaimer: it goes on the generated page, which is the app's own text.
- **New tests must be shown failing first.** Two tests written for this project
  passed against broken code until they were checked that way. Mutate the code,
  confirm the test fails for the right reason, then restore.

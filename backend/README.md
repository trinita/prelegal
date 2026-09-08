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
| `documents.json` | The ten documents besides the MNDA, and the terms each one's clauses reference |

A handful of fields carry `"referenced": false`: no clause links to them, but the
document is unusable without them. Common Paper expects a separate Order Form to
state the price and name the product; this app generates one page, so those
fields live here instead.
| `app/ai/` | The assistant: catalogue, field schema, prompts, the model call, and merging its answer |
| `app/routers/` | `auth.py`, `chat.py` and `health.py` |

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

## The assistant

`POST /api/chat/message` takes the conversation and the document's current
values, and returns a reply together with the merged values. The call is
LiteLLM → OpenRouter → `openai/gpt-oss-120b`, with the provider pinned to
Cerebras and Structured Outputs so the answer is read as data rather than
parsed out of prose.

The assistant also chooses *which* document is being drafted. Every answer names
one from a closed list built from the catalogue, so it can only pick something
the templates actually support. Until one is settled the schema has no `updates`
at all — asking for values before knowing the document would invite filling in a
form it has not been shown. Choosing or changing a document starts it empty: a
pilot agreement's answers are not what a HIPAA addendum needs, and carrying them
across would put one document's details into another's clauses.

Three more decisions are worth knowing before changing `app/ai/`:

- **Every field in the response schema is nullable, and all of them are
  required.** Strict mode insists each property be present, so `null` is how the
  model says "the user did not tell me" instead of being pushed into inventing a
  value on every turn.
- **`null` and an empty string both mean "no change".** A model reporting
  nothing must never be able to erase what someone already gave. Clearing a
  value deliberately is what the *Edit fields* form is for.
- **The state of the document is re-sent every turn** rather than left to the
  model's memory of the conversation, so a long chat cannot drift out of step
  with the document on screen.
- **A value still equal to the template's default is treated as unconfirmed.**
  The browser sends the template's starting values on the first turn, so without
  this the assistant reads them as answers and never raises them — and someone
  signs a one-year term they were never asked about. They are listed separately
  and must be put to the user before the document can be called ready.
- **Fields are named to the model by a plain-language label**, never by
  `partyOne.printName` or `untilTerminated`. The state block is the one place
  jargon would otherwise reach a model told to speak plainly.

Values are re-validated on arrival. An enum outside its list, a year count that
is not a positive whole number, a date that is not ISO `yyyy-mm-dd`, or a value
past the length limit is discarded rather than written into an agreement. The
schema should make most of these impossible; they are checked because the cost
of being wrong is a defective legal document. The date check matters most: the
renderer prints anything it cannot parse verbatim *and marks it as a filled
value*, so "next month" would look like a date somebody had confirmed.

Whether a field is required can depend on another — a term length is only needed
when the term is the kind that expires. `Field.is_required` mirrors the form's
own rules, so the assistant cannot call a document ready that the preview beside
it still shows as incomplete.

The endpoint requires a session. Each message costs money, so it is not left
open to anyone who can reach the port.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PRELEGAL_DATABASE_PATH` | `backend/data/prelegal.db` | Where the temporary SQLite file goes |
| `PRELEGAL_STATIC_DIR` | `backend/static` | The built frontend; skipped if absent |
| `PRELEGAL_DEV_ORIGINS` | `["http://localhost:3000", "http://127.0.0.1:3000"]` | Origins allowed to call the API with credentials |
| `PRELEGAL_SESSION_COOKIE_NAME` | `prelegal_session` | Session cookie name |
| `OPENROUTER_API_KEY` | none | The assistant's key. Without it, chat returns 503 and the rest of the app is unaffected. |
| `PRELEGAL_FIELDS_PATH` | `mnda-fields.json` at the repo root | The Mutual NDA's cover page fields |
| `PRELEGAL_DOCUMENTS_PATH` | `documents.json` at the repo root | The other ten documents |
| `PRELEGAL_AI_MODEL` | `openrouter/openai/gpt-oss-120b` | Model, as LiteLLM names it |
| `PRELEGAL_AI_PROVIDER` | `cerebras` | Pinned inference provider |
| `PRELEGAL_MAX_HISTORY_MESSAGES` | `40` | Turns forwarded per request |
| `PRELEGAL_MAX_MESSAGE_CHARACTERS` | `4000` | Per-message cap |

## Tests

```bash
uv run pytest
```

77 tests. No test makes a network call: the model is stubbed.

- The fake login, and the session cookie's edge cases — a cookie naming a user
  who no longer exists, a malformed one.
- The two properties the database is supposed to have: the schema exists after
  start-up, and a restart discards what came before.
- The race two simultaneous first-time logins under the same name would
  otherwise lose.
- What the assistant is allowed to write into the document: nulls and blanks
  leave values alone, a state outside the list is dropped, a year count that is
  not a positive whole number is dropped, and an invented field name is ignored.
- The response schema's strictness, which the provider would otherwise reject at
  request time.
- The endpoint: a missing key is a 503 rather than a 500, history and message
  length are capped, and signing in is required.
- What the assistant is shown: template defaults appear as needing confirmation
  rather than as answers, a value the user chose is settled even when it happens
  to equal the default, and no field name or code word reaches the model.
- Choosing a document: the whole catalogue reaches the assistant, a document it
  cannot produce leaves nothing started, an id the catalogue does not have is
  refused, changing document does not carry the old answers over, and every one
  of the eleven can be chosen and holds a value.

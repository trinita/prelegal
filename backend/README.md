# Prelegal backend

FastAPI over SQLite, packaged with [uv](https://docs.astral.sh/uv/). In the
container it does two jobs: it answers the JSON API under `/api`, and it serves
the frontend's static build for everything else — which is why the whole product
lives on http://localhost:8000 rather than on two ports.

Implements [PL-7](https://trinitadewanti.atlassian.net/browse/PL-7), the chat in
[PL-8](https://trinitadewanti.atlassian.net/browse/PL-8) and
[PL-9](https://trinitadewanti.atlassian.net/browse/PL-9), and accounts and saved
documents in [PL-10](https://trinitadewanti.atlassian.net/browse/PL-10).

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
| `app/models.py` | SQLAlchemy models: `User`, `AuthSession`, `SavedDocument` |
| `app/schemas.py` | Request and response bodies |
| `app/sessions.py` | Session tokens, and the cookie that carries one |
| `app/security.py` | Password hashing, with `hashlib.scrypt` |
| `app/users.py` | Registering an account, and checking a password |
| `app/documents.py` | Saved documents, always scoped to their owner |
| `documents.json` | The ten documents besides the MNDA, and the terms each one's clauses reference |

A handful of fields carry `"referenced": false`: no clause links to them, but the
document is unusable without them. Common Paper expects a separate Order Form to
state the price and name the product; this app generates one page, so those
fields live here instead.
| `app/ai/` | The assistant: catalogue, field schema, prompts, the model call, and merging its answer |
| `app/routers/` | `auth.py`, `chat.py`, `documents.py` and `health.py` |

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
guaranteed-clean start is worth more than durable data.

PL-10 saves accounts and documents into it regardless, which the ticket asked
for explicitly. The consequence — a restart signs everyone out and takes their
documents with it — is stated on the sign-in screen and above the documents
list, so it is a known limitation rather than a surprise. Whichever ticket makes
that data worth keeping is the one that should add Alembic and a volume.

## Saved documents

`POST /api/documents` starts one; `PUT /api/documents/{id}` writes its values,
its transcript, or both, leaving whichever half was not sent alone. The browser
decides when to save, because a document changes both by talking to the
assistant and by typing into the form, and only one of those goes through the
chat endpoint — persisting from there would have left every hand-typed
correction unsaved. `app/routers/chat.py` therefore stores nothing at all, and
no longer takes a database session.

Every function in `app/documents.py` takes the owner and filters on it inside the
query. There is no function that fetches a document by id alone, so a route has
nothing to reach for that would skip the check. Another user's document answers
404, never 403: a 403 would confirm the row exists.

## Signing in

An account is an email address, a display name and a password. The password is
hashed with `hashlib.scrypt` — memory-hard, from the standard library, with the
cost parameters written into each stored hash so raising them later does not
invalidate what is already there.

The cookie holds a random 256-bit token. Only its SHA-256 is stored, so a copy
of the `sessions` table hands out no live sessions, and a token nobody issued
matches nothing. Signing out deletes the row, which is what makes it a
revocation rather than a request that the browser forget something.

An unsalted SHA-256 is right for the token and would be quite wrong for the
password: the token is already high-entropy random, so there is nothing to guess
at and nothing for stretching to slow down.

Both mechanisms are deliberately dependency-free. The backend has five runtime
dependencies, all of them things it cannot run without, and a password hasher is
not in that category — `app/security.py` is short enough to read start to finish,
with no library defaults to take on trust.

An unknown address and a wrong password produce the same 401 and the same
sentence. Distinguishing them would turn the sign-in form into a way to ask
which addresses have accounts here.

Saying the same thing is not sufficient on its own. scrypt is deliberately slow,
so returning as soon as the address is not found refused an unknown address
about 300 times faster than a real one with the wrong password — identical
words, and a clock that gave the answer away. `authenticate_user` therefore
verifies against a hash belonging to nobody on that branch, so both cost the
same.

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
| `PRELEGAL_SESSION_MAX_AGE_SECONDS` | 30 days | How long the cookie is offered for. The session ends with the database either way |
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

121 tests. No test makes a network call: the model is stubbed.

- Password hashing: a password verifies against its own hash and nothing else,
  the same password hashes differently every time, the parameters travel with
  the hash, and an unreadable stored value is a mismatch rather than a crash.
- Registering and signing in: a duplicate address is refused, an address is
  matched regardless of case, a wrong password and an unknown address are
  refused in the same words, and two people may share a display name.
- The session: a hand-written cookie and a tampered token both sign nobody in,
  the raw token is not what is stored, signing out deletes the row rather than
  only the cookie, and signing out of one browser leaves another signed in.
- Saved documents: values and transcript save independently, an empty save is
  refused, the list is ordered and scoped to its owner, a second document of the
  same kind is numbered, and another account's document is 404 on both read and
  write.
- The two properties the database is supposed to have: the schema exists after
  start-up, and a restart discards accounts and their documents alike.
- The race two simultaneous registrations of the same address would otherwise
  lose.
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

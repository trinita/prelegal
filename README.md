# Prelegal

A platform for drafting common legal agreements.

Prelegal starts from the [Common Paper](https://commonpaper.com) standard
agreements — lawyer-drafted templates published under CC BY 4.0 — and lets a
user produce a finished, signable document by filling in a short form.

## What's here

| Path | Contents |
| --- | --- |
| `templates/` | The agreement templates, copied verbatim from Common Paper |
| `catalog.json` | Name, description, filename and source repo for each template |
| `frontend/` | Next.js app — the login screen, the chat, and the Mutual NDA creator |
| `mnda-fields.json` | The Mutual NDA's cover page fields, shared by the form and the AI |
| `documents.json` | The other ten documents, and the terms each one's clauses reference |
| `backend/` | FastAPI + SQLite, which also serves the built frontend |
| `scripts/` | Start and stop, per platform |
| `Dockerfile` | Multi-stage build: Node compiles the frontend, Python serves it |

## Getting started

Everything runs in one container, on one port:

```bash
scripts/start-mac.sh        # or start-linux.sh, or start-windows.ps1
```

Then open http://localhost:8000 and sign in with any name — there are no
passwords yet (see *Signing in*, below). Describe the agreement you need and the
assistant fills it in as you talk. To stop:

```bash
scripts/stop-mac.sh         # or stop-linux.sh, or stop-windows.ps1
```

### Working on it

The container rebuilds the frontend on every start, which is slow for a change
you want to see immediately. For that, run the two halves separately:

```bash
cd backend && uv run uvicorn app.main:app --reload      # API on :8000
cd frontend && npm run dev                              # pages on :3000
```

The dev server points at the API on :8000 by default, so there is nothing to
configure.

See [`frontend/README.md`](frontend/README.md) and
[`backend/README.md`](backend/README.md) for each half's architecture, scripts
and tests.

## The assistant

Agreements are drafted by chatting rather than by working through a form.
Describe what you need — "we're selling our monitoring platform as a yearly
subscription" — and the assistant works out which of the eleven documents fits,
asks about it, and records what you actually tell it. The document rebuilds as
it goes. Anything it gets wrong can be corrected by saying so, or by opening the
*Edit fields* tab and typing over it.

Ask for something it cannot produce and it says so plainly, and offers the
nearest thing it can: an employment contract gets you an offer of a Professional
Services Agreement, and nothing starts until you agree.

It runs on `openai/gpt-oss-120b` through OpenRouter with Cerebras as the
inference provider, and reads `OPENROUTER_API_KEY` from `.env`. Without a key
the chat says it is unavailable; everything already recorded stays, the document
still renders, and it still downloads.

The fields it can fill are defined once — `mnda-fields.json` for the Mutual NDA,
`documents.json` for the other ten. The backend builds the assistant's schema
from those files and the frontend is tested against them, so a field added to
one and missed in the other fails the suite rather than leaving a gap in a
signed agreement. `documents.json` is checked against the templates themselves,
in both directions: a clause referring to a term nobody is asked about fails,
and so does asking about a term no clause mentions.

## Signing in, and your documents

Registering takes a name, an email address and a password. The password is
stored as an `scrypt` hash, and the session cookie holds a random token that is
looked up, by hash, in the database — so a cookie written by hand signs nobody
in, and signing out deletes the token rather than merely forgetting it.

Every agreement is saved to the account that made it, without being asked: a
document is recorded once the assistant has settled on what you need, and its
answers and conversation are written as you go. *Your documents* lists them, and
opening one puts you back where you left off, assistant included.

The database is still rebuilt from scratch every time the container starts, so
no account and nothing saved outlives a restart. That is a deliberate limit
while the schema is still moving, and the app says so on the way in and on the
list itself rather than letting anyone discover it by losing something.

## Testing

```bash
cd frontend && npm test          # 279 Vitest tests
cd backend && uv run pytest      # 121 pytest tests
```

The frontend suite covers the document-generation logic in
`frontend/src/lib/*.test.ts` — the code that decides what a signed agreement
says, so it is where a defect matters most; several tests exist because the bug
they describe actually occurred and reached review — plus the API client. The
backend suite covers registering and signing in, password hashing, the session
token's edge cases — including that a hand-written cookie and a tampered token
are both refused — the promise that a restart leaves an empty database, that one
account cannot read or write another's documents, what the assistant is allowed
to write into a document, and how it chooses one. No test calls the model.

New tests are expected to be shown failing before the fix that makes them pass.
A test that has never failed for the right reason has not been demonstrated to
test anything, and two of the tests written for this project passed against
broken code until they were checked that way.

Component rendering, print output, and cross-browser behaviour are not covered
and still need a browser-based runner.

## Status

Five slices exist so far.

The Mutual NDA creator ([PL-6](https://trinitadewanti.atlassian.net/browse/PL-6))
turns a form into a signable document: live preview, print to PDF, entirely in
the browser.

The V1 foundation ([PL-7](https://trinitadewanti.atlassian.net/browse/PL-7))
puts that behind a backend, a database and a container, with a placeholder login
in front of it. No product behaviour changed — the NDA creator is the same code,
now reachable after signing in.

The AI chat ([PL-8](https://trinitadewanti.atlassian.net/browse/PL-8)) replaces
the form as the way in: the agreement is filled in by describing it, with the
form kept behind a tab for corrections.

All eleven documents ([PL-9](https://trinitadewanti.atlassian.net/browse/PL-9))
are now supported. Only the Mutual NDA has a published cover page, so for the
other ten the app generates the key terms page their clauses refer to and
appends the standard terms unchanged.

Accounts and saved documents ([PL-10](https://trinitadewanti.atlassian.net/browse/PL-10))
replace the placeholder login with a real one: registering with an email address
and a password, and a session cookie carrying a token that cannot be forged by
hand. Every agreement is saved to the account that made it as it is drafted, and
reopening one brings back its conversation as well as its answers. Each document
carries a notice that it is a draft for review, on screen and in the PDF.

Still to come: saved documents do not outlive the server. The database is still
rebuilt on every start, which the sign-in screen and the documents list both say
plainly.

## Licence

Project code is under the terms in [`LICENSE`](LICENSE).

The agreement templates in `templates/` are the work of Common Paper and are
licensed separately under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — see
[`templates/LICENSE.txt`](templates/LICENSE.txt). Documents generated by this
project must retain attribution to Common Paper and indicate that the template
was modified.

Prelegal produces draft documents and does not provide legal advice.

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
| `mnda-fields.json` | The document's fields, shared by the form and the AI |
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

The Mutual NDA is filled in by chatting rather than by working through a form.
The assistant asks about the agreement, records what you actually tell it, and
the document rebuilds as it goes. Anything it gets wrong can be corrected by
saying so, or by opening the *Edit fields* tab and typing over it.

It runs on `openai/gpt-oss-120b` through OpenRouter with Cerebras as the
inference provider, and reads `OPENROUTER_API_KEY` from `.env`. Without a key
the chat says it is unavailable; everything already recorded stays, the document
still renders, and it still downloads.

The fields it can fill are defined once, in `mnda-fields.json`. The backend
builds the assistant's schema from that file and the frontend's form is tested
against it, so a field added to one and missed in the other fails the suite
rather than leaving a gap in a signed agreement.

## Signing in

There is no authentication yet. The login screen takes a name, and the backend
turns it into a user and a session cookie without checking anything — the cookie
is unsigned and trivially forgeable. It exists so the shape of the product is
right, and so the database is exercised end to end; real credentials arrive with
PL-10. The database is also rebuilt from scratch every time the container
starts, so no account and nothing saved outlives a restart.

## Testing

```bash
cd frontend && npm test          # 104 Vitest tests
cd backend && uv run pytest      # 55 pytest tests
```

The frontend suite covers the document-generation logic in
`frontend/src/lib/*.test.ts` — the code that decides what a signed agreement
says, so it is where a defect matters most; several tests exist because the bug
they describe actually occurred and reached review — plus the API client. The
backend suite covers the fake login, the session cookie's edge cases, the
promise that a restart leaves an empty database, the race between two
simultaneous first-time logins under the same name, and what the assistant is
allowed to write into a document. No test calls the model.

New tests are expected to be shown failing before the fix that makes them pass.
A test that has never failed for the right reason has not been demonstrated to
test anything, and two of the tests written for this project passed against
broken code until they were checked that way.

Component rendering, print output, and cross-browser behaviour are not covered
and still need a browser-based runner.

## Status

Early. Two slices exist so far.

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

Still to come: the remaining eleven templates in `catalog.json` are curated but
not yet wired up, and authentication is still a placeholder.

## Licence

Project code is under the terms in [`LICENSE`](LICENSE).

The agreement templates in `templates/` are the work of Common Paper and are
licensed separately under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — see
[`templates/LICENSE.txt`](templates/LICENSE.txt). Documents generated by this
project must retain attribution to Common Paper and indicate that the template
was modified.

Prelegal produces draft documents and does not provide legal advice.

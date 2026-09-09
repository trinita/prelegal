# Prelegal frontend

A Next.js app that builds a Common Paper agreement out of a conversation:
describe what you need, watch the document fill in, then print it to PDF.

Implements [PL-6](https://trinitadewanti.atlassian.net/browse/PL-6), behind the
login added in [PL-7](https://trinitadewanti.atlassian.net/browse/PL-7), driven
by the chat added in [PL-8](https://trinitadewanti.atlassian.net/browse/PL-8),
across all eleven documents since
[PL-9](https://trinitadewanti.atlassian.net/browse/PL-9), and saved to an account
since [PL-10](https://trinitadewanti.atlassian.net/browse/PL-10).

## Three screens

`src/app/page.tsx` switches between them on the signed-in state and one piece of
view state. There is no router: a static export has to redirect on the client,
which shows the wrong screen for a frame, and none of these needs a URL of its
own.

1. **`AuthScreen`** — sign in, or register.
2. **`DocumentsScreen`** — what this account has drafted. Where signing in lands,
   both because it is what the ticket asks people to look back at and because on
   a shared browser it opens on your own documents rather than on whatever the
   last person left half-finished.
3. **`DocumentCreator`** — the conversation and the document, as before.

## Saving

`Workspace` carries a `recordId` — the saved document's own id, kept distinct
from `documentId`, which says which of the eleven templates is being drafted.

A document is recorded as soon as the assistant settles on one. After that,
every change writes to `localStorage` immediately and to the server 800ms after
the typing stops: the local copy is what survives a refresh mid-sentence, and
only the request needs rationing. `ChatPanel` saves its own transcript the same
way, which is what lets a reopened document carry on the conversation.

Pending saves are **flushed** when a component unmounts, not cancelled. Leaving
the editor within the debounce window is precisely when an edit is still
waiting, and cancelling there loses it silently — reopening the document would
fetch the older version back from the server with nothing said.

The local draft is cleared on every change of signed-in user — but deliberately
not when an existing session is restored on page load, so refreshing keeps what
you were working on. Without that, signing out and handing over the laptop left
one person's half-typed agreement waiting for the next.

## Running it

The whole product, frontend and backend together, comes up on
http://localhost:8000 with `scripts/start-mac.sh` from the repository root.

For frontend work, the dev server is faster:

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

It calls the API on :8000 by default, so run the backend alongside it
(`cd backend && uv run uvicorn app.main:app --reload`). Without one, the app
sits on the login screen and says it cannot reach the server.

`npm run dev` and `npm run build` both run `sync-templates` first, so the app
always builds against the current templates. `npm run build` produces a static
export in `out/`, which is what FastAPI serves in the container.

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Run the test suite once |
| `npm run test:watch` | Re-run tests as files change |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run sync-templates` | Regenerate `src/templates/sources.ts` |

## How it fits together

```
                      AuthProvider (contexts/AuthContext.tsx)
                                   │  GET /api/auth/me
                                   ▼
              app/page.tsx ── checking? ──> splash
                            ── signed out? ──> AuthScreen
                            ── signed in? ──> AppShell > DocumentsScreen
                                                       │       │ GET /api/documents
                                                       │       │ open one ─┐
                                                       └──> DocumentCreator <┘
                                                            │  GET /api/documents/{id}
                    ChatPanel ──POST /api/chat/message──> reply + values
                       or NdaForm/TermsForm ("Edit fields") │
                                              both setWorkspace
                                                            │ 800ms after the
                                                            ▼ typing stops
                                          PUT /api/documents/{id}  (values)
                                          PUT /api/documents/{id}  (transcript)

templates/*.md ──sync-templates.mjs──> src/templates/sources.ts
                                              │             │
        src/lib/fields.ts (schema) ───────────┤             │
                                              ▼             ▼
   NdaForm ──values──> src/lib/render.ts ──> markdown.ts ──> DocumentPreview
                       (+ lib/disclaimer.ts)                        │
                                                          print stylesheet → PDF
```

- **`app/page.tsx`** picks between the sign-in screen, the documents list and
  the creator. It is one page rather than three routes because a static export
  has to redirect on the client, which shows the wrong screen for a frame.
- **`lib/api.ts`** is the only place that calls the backend. Every request sends
  credentials, so the session cookie travels in both the same-origin and the
  split dev setup.
- **`components/AppShell.tsx`** is the signed-in chrome. The print stylesheet
  hides it along with the rest of the UI, so it never reaches the PDF.
- **`components/ChatPanel.tsx`** holds the conversation. The server returns the
  reply and the document's new values in one object, so the transcript and the
  preview can never disagree about what was recorded.
- **`DocumentCreator`** owns the workspace — which document, and everything said
  about it — and hands the same values to the chat, the form and the preview, so
  the three cannot disagree. The form is how a value gets *cleared*, which the
  assistant deliberately cannot do.
- **`lib/chat.ts`** keeps the transcript in `localStorage` and filters out turns
  it cannot render, so a conversation saved by an older version of the app does
  not put `undefined` on the page.

- **`src/lib/fields.ts`** defines every cover-page field once. The form, the
  saved draft and the completeness check all read from it, so adding a field is
  a single edit.
- **`src/lib/render.ts`** substitutes values into the template markdown. All
  user input is escaped here, before it reaches the renderer.
- **`src/lib/markdown.ts`** converts the filled markdown to HTML. It handles
  only the constructs these two documents use, which keeps the app free of
  runtime dependencies.
- **`src/lib/draft.ts`** persists work-in-progress to `localStorage`.

## Tests

```bash
npm test
```

279 tests, run with [Vitest](https://vitest.dev), covering the document-generation
logic — the part where a defect ends up in a signed agreement — and the code
that talks to the backend:

- **`render.test.ts`** — values reach the right places, term checkboxes track
  the choice made, blanks are marked unfilled, and the escaping holds. Several
  cases exist because the bug they describe actually occurred: a `|` in a notice
  address splitting the signature table, newlines in a textarea introducing
  headings into the agreement, `**bold**` and `[links](…)` typed into a field
  becoming real markup in the agreement, a half-typed term length rendering as
  "Expires  years", and values being substituted into the standard terms where a
  defined term belongs.
- **`render-guard.test.ts`** — rendering fails loudly, naming the file to
  reconcile, when a template no longer contains an expected placeholder.
- **`markdown.test.ts`** — the renderer's blocks and inline formatting,
  including ragged table rows and clauses separated by blank lines.
- **`fields.test.ts`** — which fields are outstanding, and when a year count is
  and is not required.
- **`draft.test.ts`** — round trips, drafts saved by an older version of the
  form, and storage that is blocked, full, or absent.
- **`api.test.ts`** — the session cookie is sent, the server's own error message
  reaches the user, a 204 has no body to parse, and an unreachable server is
  reported as such rather than as an answer.
- **`chat.test.ts`** — the transcript and the document's values are posted
  together, and a stored conversation in an older or broken shape degrades to
  the greeting instead of rendering nothing.
- **`schema-drift.test.ts`** — the form and `mnda-fields.json` describe the same
  document. A field added to one and missed in the other fails here, which is
  the whole reason the shared file exists. It also holds the two sides to the
  same defaults and the same conditional requirements, since the assistant
  decides what to confirm and what to ask for from that file.
- **`ChatPanel.test.tsx`** — the component tests, which exist because the bugs
  they describe actually happened: a failed send dropped the user's message
  entirely and *Try again* resent the conversation without it; and a slow reply
  could land on a workspace that had changed underneath it. Answers are now
  written as an update on the latest state, and the *Edit fields* tab is held
  shut while a reply is on its way.
- **`render-terms.test.ts`** — the generated key terms page and the standard
  terms behind it, for every one of the ten: every referenced term is asked
  about, no value is ever substituted into a clause, and typed markdown, pipes
  and HTML stay inert.
- **`documents-drift.test.ts`** — `documents.json` against the templates, in
  both directions. A clause referring to a term nobody is asked about fails, and
  so does asking about a term no clause mentions.
- **`disclaimer.test.ts`** — the draft notice reaches every document's generated
  page, and reaches no document's Standard Terms. It asserts against the
  rendered HTML rather than the screen, because that HTML is the only part that
  survives printing, and the PDF is where the warning has to be.
- **`workspace.test.ts`** — a record id is not a document id, and a saved
  document restores with the template defaults it was saved without.
- **`debounce.test.ts`** — a burst collapses to one call, the wait restarts on
  each call, and a cancelled call never runs.
- **`AuthScreen.test.tsx`** — the two modes send to two different endpoints, a
  sign-in error does not follow the user into registering, and a password too
  short for the server to accept is refused before it is sent.
- **`DocumentsScreen.test.tsx`** — the list, the empty state, and a failure that
  offers a retry that actually asks again.
- **`DocumentCreator.test.tsx`** — a document is recorded once and only once,
  answers are saved when the typing stops rather than on every keystroke, a
  reopened document brings its conversation back, and a server that cannot be
  reached leaves the agreement on screen and printable.
- **`page.test.tsx`** — signing in lands on the documents list, and signing out
  puts the view back so the next person does not land in the editor.

Component tests run under jsdom, opted into per file with a
`// @vitest-environment jsdom` docblock so the rest of the suite stays on the
faster node environment. `DocumentCreator.test.tsx` renders one case inside
`StrictMode`, since that is what `next.config.ts` turns on and it is how a
duplicate document would most plausibly appear.

Not yet covered: print output and cross-browser behaviour. Those still need a
person, or a browser-based runner.

## The templates are not stored here

`src/templates/sources.ts` is **generated** and git-ignored. The legal text lives
in the repository's top-level `templates/` directory, curated in PL-5 and
described by `catalog.json`. `scripts/sync-templates.mjs` copies it in verbatim
at build time so the wording cannot drift from the source, and fails loudly if a
template is missing or empty rather than building a document with the wrong
text.

To change the agreement wording, edit `templates/` — never `src/templates/`.

## Two kinds of document

Common Paper publishes a fill-in **cover page** only for the Mutual NDA. That
one keeps the hand-built form and renderer of PL-6, because its cover page has
structure: two parties, paired term choices.

The other ten are **Standard Terms** that reference terms a cover page is
expected to define. For those the app generates that page — the terms, their
values, and a signature block — and appends the Standard Terms unchanged. One
form and one renderer serve all ten, driven by `documents.json`, so adding a
document needs no new component.

Five different span classes mark those references across the templates
(`coverpage_link`, `keyterms_link`, `orderform_link`, `sow_link`,
`businessterms_link`). Handling only the first three left raw template markup in
two agreements, which is why `documents-drift.test.ts` checks every document
against its own template rather than trusting the catalogue.

A few fields belong to a document without any clause linking to them: Common
Paper expects a separate **Order Form** to carry the price and name the product,
and this app generates one page. Those are marked `"referenced": false`, so the
drift test knows they are meant to be absent from the template — without them a
Cloud Service Agreement could be called ready to sign while saying neither what
was bought nor what it cost.

## Two kinds of placeholder

The two source documents mark their variables differently, and the renderer
treats them differently on purpose:

- The **cover page** has genuine blanks — `[Fill in state]`, `- [x]` / `- [ ]`
  choices, an empty signature table. These are replaced with the user's values.
- The **standard terms** reference the cover page by *defined term*:
  `<span class="coverpage_link">Purpose</span>`. These clauses are written to
  read with the term, not its value — "solely for the Purpose", "provisions of
  such Governing Law" — so substituting the value there would produce broken
  sentences and alter the legal text. They are rendered as the term name, and
  the values appear on the cover page, which forms half of the same agreement.

## Licence

The generated document is derived from the Common Paper Mutual NDA, free to use
and modify under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The
attribution line travels with the document because it is part of the template
text itself. See `templates/LICENSE.txt`.

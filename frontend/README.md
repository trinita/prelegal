# Prelegal frontend

A Next.js app that turns the Common Paper Mutual NDA into a fill-in form: enter
the key details, watch the agreement build as you type, then print it to PDF.

Implements [PL-6](https://trinitadewanti.atlassian.net/browse/PL-6), behind the
login added in [PL-7](https://trinitadewanti.atlassian.net/browse/PL-7).

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
                            ── signed out? ──> LoginScreen
                            ── signed in? ──> AppShell > NdaCreator
                                                            │
templates/*.md ──sync-templates.mjs──> src/templates/sources.ts
                                              │             │
        src/lib/fields.ts (schema) ───────────┤             │
                                              ▼             ▼
   NdaForm ──values──> src/lib/render.ts ──> markdown.ts ──> DocumentPreview
                                                                    │
                                                          print stylesheet → PDF
```

- **`app/page.tsx`** picks between the login screen and the platform. It is one
  page rather than a `/login` route because a static export has to redirect on
  the client, which shows the wrong screen for a frame.
- **`lib/api.ts`** is the only place that calls the backend. Every request sends
  credentials, so the session cookie travels in both the same-origin and the
  split dev setup.
- **`components/AppShell.tsx`** is the signed-in chrome. The print stylesheet
  hides it along with the rest of the UI, so it never reaches the PDF.

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

85 tests, run with [Vitest](https://vitest.dev), covering the document-generation
logic — the part where a defect ends up in a signed agreement — and the API
client:

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

Not yet covered: component rendering and interaction — which now includes the
login screen and the auth gate — print output, and cross-browser behaviour.
Those still need a person, or a browser-based runner with jsdom set up.

## The templates are not stored here

`src/templates/sources.ts` is **generated** and git-ignored. The legal text lives
in the repository's top-level `templates/` directory, curated in PL-5 and
described by `catalog.json`. `scripts/sync-templates.mjs` copies it in verbatim
at build time so the wording cannot drift from the source, and fails loudly if a
template is missing or empty rather than building a document with the wrong
text.

To change the agreement wording, edit `templates/` — never `src/templates/`.

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

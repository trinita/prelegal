/**
 * Builds the documents that have no published cover page.
 *
 * Common Paper publishes a fill-in cover page only for the Mutual NDA. The
 * other ten are Standard Terms that reference terms a cover page is expected to
 * define. So this generates that page: the terms and their values, and a
 * signature block.
 *
 * What it does *not* do is substitute values into the Standard Terms. Those
 * clauses are written to read with the defined term — "during the Pilot
 * Period", "governed by the Governing Law" — so putting the value there would
 * produce broken sentences and alter the legal wording. The references are
 * marked up and left as terms, exactly as the Mutual NDA's renderer does.
 */
import { standardTermsById } from "@/templates/sources";
import { renderMarkdown } from "./markdown";
import { blank, formatEffectiveDate, highlight, inlineText } from "./escape";
import type { DocumentField, DocumentSpec, TermValues } from "./documents";
import { draftDisclaimerHtml } from "./disclaimer";

/**
 * Terms naming a party, most senior first.
 *
 * Every one of these documents introduces its parties in this order — "this
 * Cover Page identifies Provider and Customer" — so the signature columns
 * follow it. Taking them in field order instead sorts them alphabetically,
 * which heads nine of the ten documents backwards.
 */
const PARTY_TERMS = ["Provider", "Customer", "Company", "Partner"];

const valueCell = (field: DocumentField, values: TermValues) => {
  const value = (values[field.name] ?? "").trim();
  if (value === "") return blank();

  // A date reads as "1 April 2027" in the document, not as the ISO form the
  // assistant records it in - the same as the Mutual NDA's cover page.
  return highlight(
    field.type === "date" ? formatEffectiveDate(value) : inlineText(value),
  );
};

/**
 * The two parties, as the signature table should head them.
 *
 * Falls back to the term itself, so an unfilled document still prints a table
 * somebody could sign by hand rather than one with empty headings.
 */
function parties(document: DocumentSpec, values: TermValues): string[] {
  const found = document.fields
    .filter((field) => PARTY_TERMS.includes(field.term))
    .sort((a, b) => PARTY_TERMS.indexOf(a.term) - PARTY_TERMS.indexOf(b.term));

  return found
    .slice(0, 2)
    .map((field) => {
      const value = (values[field.name] ?? "").trim();
      return value === "" ? inlineText(field.term) : highlight(inlineText(value));
    });
}

function keyTermsPage(document: DocumentSpec, values: TermValues): string {
  const rows = document.fields.map(
    (field) => `| ${inlineText(field.term)} | ${valueCell(field, values)} |`,
  );

  const [first = "PARTY 1", second = "PARTY 2"] = parties(document, values);

  return [
    `# ${inlineText(document.name)}`,
    "",
    "## Key Terms",
    "",
    "This Key Terms page defines the terms used by the Standard Terms that follow.",
    "Together they form the agreement between the parties.",
    "",
    "| Term | Value |",
    "|:--- | :--- |",
    ...rows,
    "",
    "By signing below, each party agrees to this agreement as of the Effective Date.",
    "",
    `|| ${first} | ${second} |`,
    "|:--- | :----: | :----: |",
    "| Signature | | |",
    "| Print Name | | |",
    "| Title | | |",
    "| Date | | |",
  ].join("\n");
}

/**
 * Every convention the templates use to reference a defined term.
 *
 * Five of them, and which one a document uses says nothing about how it should
 * render — a term is a term. Handling only the first three left raw template
 * markup in the Professional Services and Partnership agreements.
 */
const TERM_REFERENCE =
  /<span class="(?:coverpage|keyterms|orderform|sow|businessterms)_link"[^>]*>(.*?)<\/span>/g;

function markUpTerms(source: string, document: DocumentSpec): string {
  // Matched on the spelling as written, so a possessive or a plural is
  // recognised as the term it belongs to. Fields no clause references - the
  // price, the thing being sold - contribute no spellings and so match nothing.
  const known = new Set(document.fields.flatMap((field) => field.termForms));

  return source.replace(TERM_REFERENCE, (_original, raw: string) => {
    const spelling = raw.replace(/[’']s$/, "");
    const cls = known.has(spelling) ? "defined-term" : "";
    return `<span class="${cls}">${inlineText(raw)}</span>`;
  });
}

/**
 * The notice CC BY 4.0 requires on an adapted work.
 *
 * templates/LICENSE.txt asks for three things: credit to Common Paper, a link
 * to the licence, and a statement of what was changed. The Mutual NDA's own
 * cover page carries the link in its template text; these ten documents have no
 * such line of their own, so without it here the generated document would meet
 * only two of the three.
 *
 * Free of dates or other varying text, so the server and client renders stay
 * identical.
 */
const LICENCE_URL = "https://creativecommons.org/licenses/by/4.0/";

const modificationNotice = (document: DocumentSpec) =>
  `Adapted from the Common Paper ${document.name}, free to use and modify under ` +
  `<a href="${LICENCE_URL}" rel="noreferrer noopener">CC BY 4.0</a>. ` +
  "This Key Terms page has been generated from the details given using Prelegal. " +
  "The Standard Terms are reproduced without modification.";

export interface RenderedTermsDocument {
  keyTermsHtml: string;
  standardTermsHtml: string;
}

export function renderTermsDocument(
  document: DocumentSpec,
  values: TermValues,
): RenderedTermsDocument {
  const source = standardTermsById[document.id];

  if (source === undefined) {
    // The catalogue and the synced templates have gone out of step; say so
    // rather than rendering half an agreement.
    throw new Error(
      `No Standard Terms synced for ${document.id}. Run \`npm run sync-templates\`.`,
    );
  }

  return {
    keyTermsHtml:
      renderMarkdown(keyTermsPage(document, values)) +
      `\n${draftDisclaimerHtml()}` +
      `\n<p class="modification-notice">${modificationNotice(document)}</p>`,
    standardTermsHtml: renderMarkdown(markUpTerms(source, document)),
  };
}

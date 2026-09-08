/**
 * Fills the Mutual NDA templates with the values from the form.
 *
 * Both source documents are copied verbatim from `templates/` by
 * scripts/sync-templates.mjs, so the legal wording lives in exactly one place.
 * This module only substitutes values into the placeholders those documents
 * already define:
 *
 *   - the cover page marks its fill-in fields with [square brackets] and
 *     offers alternatives as `- [x]` / `- [ ]` checkboxes;
 *   - the standard terms reference cover page values inline with
 *     `<span class="coverpage_link">Field Name</span>`.
 *
 * Every user-supplied value is escaped before substitution: the result is
 * rendered as HTML, and party details are free text.
 */
import { coverPageSource, standardTermsSource } from "@/templates/sources";
import { escapeHtml, renderMarkdown } from "./markdown";
import { BLANK, blank, formatEffectiveDate, highlight, inlineText } from "./escape";

export { formatEffectiveDate };
import { isPositiveNumber, type MndaValues, type Party } from "./fields";

const orBlank = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? blank() : highlight(inlineText(trimmed));
};

/**
 * Renders a term length, or a blank if the field cannot yet produce one.
 *
 * The number input is empty for as long as it takes to retype a value, and can
 * hold zero or a negative number. Splicing those in unchecked produced
 * "Expires  years from Effective Date" styled as though it were confirmed,
 * disagreeing with the outstanding-items list about whether the field was done.
 */
const yearsOrBlank = (years: string) => {
  const trimmed = years.trim();
  if (!isPositiveNumber(trimmed)) return blank();
  return highlight(`${escapeHtml(trimmed)} year${trimmed === "1" ? "" : "s"}`);
};

/**
 * Substitutes every placeholder in one pass over the original template.
 *
 * Two properties matter here, and chained `.replace()` calls give neither:
 *
 * A missing placeholder must fail loudly. Each is matched literally, so an edit
 * to `templates/mutual-nda-coverpage.md` - even one as small as a straight
 * quote replacing a curly one - stops it matching. `.replace()` is silent in
 * that case and would emit an agreement still carrying the template's own
 * placeholder text, which for a legal document is far worse than an error.
 *
 * And a value already substituted must never be re-read as a placeholder. Every
 * position is resolved against the untouched source, so text the user typed
 * cannot collide with a placeholder that has yet to be filled.
 */
function fillTemplate(
  source: string,
  replacements: ReadonlyArray<readonly [placeholder: string, value: string]>,
): string {
  const found = replacements.map(([placeholder, value]) => {
    const index = source.indexOf(placeholder);
    if (index === -1) {
      throw new Error(
        `Mutual NDA template no longer contains the expected placeholder ` +
          `${JSON.stringify(placeholder.slice(0, 60))}. ` +
          `Reconcile src/lib/render.ts with templates/mutual-nda-coverpage.md.`,
      );
    }
    return { index, placeholder, value };
  });

  found.sort((a, b) => a.index - b.index);

  let result = "";
  let cursor = 0;
  for (const { index, placeholder, value } of found) {
    if (index < cursor) {
      throw new Error(
        `Mutual NDA placeholders overlap at ${JSON.stringify(placeholder.slice(0, 60))}; ` +
          `each must match a distinct part of the template.`,
      );
    }
    result += source.slice(cursor, index) + value;
    cursor = index + placeholder.length;
  }
  return result + source.slice(cursor);
}

/**
 * Replaces the cover page's bracketed placeholders and resolves its checkboxes,
 * leaving all surrounding wording untouched.
 */
function fillCoverPage(values: MndaValues): string {
  const expires = values.mndaTermType === "expires";
  const yearsTerm = values.confidentialityTermType === "years";
  const tick = (selected: boolean) => (selected ? "x" : " ");

  const replacements: Array<[placeholder: string, value: string]> = [
    [
      "[Evaluating whether to enter into a business relationship with the other party.]",
      orBlank(values.purpose),
    ],
    [
      "[Today’s date]",
      values.effectiveDate.trim() === ""
        ? blank()
        : highlight(formatEffectiveDate(values.effectiveDate)),
    ],
    [
      "- [x]     Expires [1 year(s)] from Effective Date.",
      `- [${tick(expires)}]     Expires ${yearsOrBlank(values.mndaTermYears)} from Effective Date.`,
    ],
    [
      "- [ ]     Continues until terminated in accordance with the terms of the MNDA.",
      `- [${tick(!expires)}]     Continues until terminated in accordance with the terms of the MNDA.`,
    ],
    [
      "- [x]     [1 year(s)] from Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws.",
      `- [${tick(yearsTerm)}]     ${yearsOrBlank(values.confidentialityYears)} from Effective Date, but in the case of trade secrets until Confidential Information is no longer considered a trade secret under applicable laws.`,
    ],
    ["- [ ]     In perpetuity.", `- [${tick(!yearsTerm)}]     In perpetuity.`],
    ["[Fill in state]", orBlank(values.governingLaw)],
    [
      "[Fill in city or county and state, i.e. “courts located in New Castle, DE”]",
      orBlank(values.jurisdiction),
    ],
    [
      "List any modifications to the MNDA",
      values.modifications.trim() === ""
        ? "None."
        : highlight(inlineText(values.modifications)),
    ],
    [BLANK_SIGNATURE_TABLE, signatureTable(values)],
  ];

  return fillTemplate(coverPageSource, replacements);
}

/**
 * The signature table's fixed rows.
 *
 * Signature and Date stay empty in both the template and the output: the
 * parties complete them by hand on signing, which need not be the effective
 * date.
 */
const SIGNATURE_TABLE_HEAD = ["|| PARTY 1 | PARTY 2 |", "|:--- | :----: | :----: |"];
const SIGNATURE_ROW = "| Signature | | |";
const DATE_ROW = "| Date | | |";

/** The blank signature table exactly as it appears in the source document. */
const BLANK_SIGNATURE_TABLE = [
  ...SIGNATURE_TABLE_HEAD,
  SIGNATURE_ROW,
  // The source's Print Name row is short a cell; kept verbatim so it matches.
  "| Print Name | |",
  "| Title | | |",
  "| Company | | |",
  "| Notice Address <label>Use either email or postal address</label> | | |",
  DATE_ROW,
].join("\n");

function signatureTable(values: MndaValues): string {
  const cell = (party: Party, key: keyof Party) => {
    const value = party[key].trim();
    // inlineText also neutralises `|`, which would otherwise open a new table
    // cell and silently shunt the other party's details out of the row.
    return value === "" ? "" : inlineText(value);
  };
  const row = (label: string, key: keyof Party) =>
    `| ${label} | ${cell(values.partyOne, key)} | ${cell(values.partyTwo, key)} |`;

  return [
    ...SIGNATURE_TABLE_HEAD,
    SIGNATURE_ROW,
    row("Print Name", "printName"),
    row("Title", "title"),
    row("Company", "company"),
    row("Notice Address", "noticeAddress"),
    DATE_ROW,
  ].join("\n");
}

/**
 * The cover page fields the standard terms refer to by name.
 *
 * These are *defined terms*, not blanks: the clauses are written to read with
 * the term itself ("solely for the Purpose", "provisions of such Governing
 * Law", "expires at the end of the MNDA Term"). Splicing the value in its place
 * produces broken sentences - "solely for the Evaluating whether to enter into
 * a business relationship" - and changes the legal text, so the references are
 * rendered as the term name and merely marked up. The values themselves are
 * stated on the cover page, which forms half of the same agreement.
 */
const COVER_PAGE_TERMS = new Set([
  "Purpose",
  "Effective Date",
  "MNDA Term",
  "Term of Confidentiality",
  "Governing Law",
  "Jurisdiction",
]);

/** Marks up the `<span class="coverpage_link">…</span>` references. */
function fillStandardTerms(): string {
  return standardTermsSource.replace(
    /<span class="coverpage_link">(.*?)<\/span>/g,
    (_original, term: string) => {
      // An unrecognised reference means the template gained a term the schema
      // does not know about; render it plainly rather than dropping it.
      const known = COVER_PAGE_TERMS.has(term);
      return `<span class="${known ? "defined-term" : ""}">${escapeHtml(term)}</span>`;
    },
  );
}

/**
 * The notice CC BY 4.0 requires on an adapted work.
 *
 * templates/LICENSE.txt records the obligation: a generated document must keep
 * attribution to Common Paper *and* indicate that the template was modified.
 * The attribution line travels with the template text itself, but nothing in it
 * says this copy was adapted - so the statement is added to the document rather
 * than to the surrounding page, which the print stylesheet hides.
 *
 * Deliberately free of dates or other varying text, so the rendered output
 * stays identical between the server and client renders.
 */
const MODIFICATION_NOTICE =
  "Adapted from the Common Paper Mutual Non-Disclosure Agreement (Version 1.0) " +
  "using Prelegal: this Cover Page has been completed with the parties' details. " +
  "The Standard Terms are reproduced without modification.";

export interface RenderedDocument {
  coverPageHtml: string;
  standardTermsHtml: string;
}

export function renderDocument(values: MndaValues): RenderedDocument {
  const coverPage =
    renderMarkdown(fillCoverPage(values)) +
    `\n<p class="modification-notice">${MODIFICATION_NOTICE}</p>`;

  return {
    coverPageHtml: coverPage,
    standardTermsHtml: renderMarkdown(fillStandardTerms()),
  };
}

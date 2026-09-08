/**
 * Preparing user values for splicing into template markdown.
 *
 * Extracted from render.ts when the other ten documents arrived: they generate
 * a key terms page rather than filling in a published cover page, but the text
 * reaching a signed agreement has to be neutralised in exactly the same way. A
 * second implementation of this is the last thing this project needs.
 */
import { escapeHtml } from "./markdown";

/** Placeholder shown where a required value has not been entered yet. */
export const BLANK = "__________";

/**
 * Marks a value as supplied by the user, so the preview shows at a glance what
 * came from the form. The print stylesheet drops the highlight.
 */
export const highlight = (value: string) => `<span class="filled">${value}</span>`;

/** Marks a value the user has not supplied yet. */
export const blank = () => `<span class="unfilled">${BLANK}</span>`;

/**
 * Prepares free text for splicing into the template markdown.
 *
 * HTML escaping alone is not enough here, because the result is re-parsed as
 * markdown before it becomes HTML:
 *
 *   - a newline would end the template line the value sits on, so a two-line
 *     Purpose would split a paragraph and leave the surrounding markup
 *     unbalanced - and a line starting `#` or `- ` would be read as a real
 *     heading or list item in the agreement;
 *   - a `|` would be read as a table cell separator, which in the signature
 *     table shifts every following cell and can push a party's details out of
 *     the row entirely;
 *   - `*` and `[` … `]` would be read as emphasis and link syntax, letting
 *     typed text bold itself or turn into a live hyperlink in the operative
 *     text of a signed agreement.
 */
export function inlineText(value: string): string {
  return escapeHtml(value.trim())
    .replace(/\|/g, "&#124;")
    .replace(/\*/g, "&#42;")
    .replace(/\[/g, "&#91;")
    .replace(/\]/g, "&#93;")
    .replace(/\r\n?|\n/g, "<br />");
}

/** Formats the effective date for a legal document, e.g. "1 January 2026". */
export function formatEffectiveDate(isoDate: string): string {
  if (isoDate.trim() === "") return BLANK;
  // Parse the parts directly: `new Date("2026-01-01")` is UTC midnight and can
  // render as the previous day for users behind UTC.
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!match) return escapeHtml(isoDate);
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(date.getTime())) return escapeHtml(isoDate);
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

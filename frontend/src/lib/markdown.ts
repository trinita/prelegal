/**
 * A small markdown-to-HTML renderer scoped to the two Mutual NDA documents.
 *
 * These templates use a narrow slice of markdown - headings, paragraphs,
 * numbered clauses, checkbox lists, a signature table, bold text and links - so
 * a focused renderer is clearer here than a general-purpose parser, and keeps
 * the app dependency-free.
 *
 * Everything this module receives is trusted template text. Values typed by the
 * user are escaped by `escapeHtml` at the point they are interpolated, before
 * they ever reach this renderer.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Bold and links. Applied to already-escaped or trusted text. */
function renderInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" rel="noreferrer noopener" target="_blank">$1</a>',
    );
}

/** `<label>` tags are editing hints in the source, not part of the agreement. */
function stripLabels(text: string): string {
  return text.replace(/<label>.*?<\/label>/gs, "").trim();
}

function renderTableRow(line: string): string[] {
  // Cover page rows start with "|" and may open with "||" for a blank heading.
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

const isTableDivider = (line: string) => /^\|[\s:|-]+\|$/.test(line.trim());

/** Line patterns, declared once so the detect and consume passes cannot drift. */
const CHECKBOX_LINE = /^-\s+\[([ xX])\]\s*(.*)$/;
const NUMBERED_LINE = /^(\d+)\.\s+(.*)$/;
const HEADING_LINE = /^(#{1,4})\s+(.*)$/;

export function renderMarkdown(markdown: string): string {
  const lines = stripLabels(markdown).split("\n");
  const html: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === "") {
      index += 1;
      continue;
    }

    const heading = HEADING_LINE.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    if (trimmed.startsWith("|")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        if (!isTableDivider(lines[index])) {
          rows.push(renderTableRow(lines[index].trim()));
        }
        index += 1;
      }
      html.push(renderTable(rows));
      continue;
    }

    const checkbox = CHECKBOX_LINE.exec(trimmed);
    if (checkbox) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = CHECKBOX_LINE.exec(lines[index].trim());
        if (!match) break;
        const checked = match[1].toLowerCase() === "x";
        // The ☒/☐ glyph is decorative, so the selection is also stated in text
        // for screen readers: this document is the artefact being signed, and
        // which option applies must not depend on seeing the box.
        items.push(
          `<li class="choice${checked ? " choice-selected" : ""}">` +
            `<span class="choice-box" aria-hidden="true">${checked ? "☒" : "☐"}</span>` +
            `<span class="visually-hidden">${checked ? "Selected:" : "Not selected:"}</span>` +
            `<span>${renderInline(match[2])}</span></li>`,
        );
        index += 1;
      }
      html.push(`<ul class="choices">${items.join("")}</ul>`);
      continue;
    }

    const numbered = NUMBERED_LINE.exec(trimmed);
    if (numbered) {
      const items: string[] = [];
      let start = numbered[1];
      while (index < lines.length) {
        const match = NUMBERED_LINE.exec(lines[index].trim());
        if (!match) {
          if (lines[index].trim() === "") {
            index += 1;
            continue;
          }
          break;
        }
        if (items.length === 0) start = match[1];
        items.push(`<li>${renderInline(match[2])}</li>`);
        index += 1;
      }
      html.push(`<ol start="${start}">${items.join("")}</ol>`);
      continue;
    }

    // Otherwise a paragraph: gather until a blank line or a new block starts.
    const paragraph: string[] = [];
    while (index < lines.length) {
      const next = lines[index].trim();
      if (next === "" || next.startsWith("|") || HEADING_LINE.test(next)) break;
      if (CHECKBOX_LINE.test(next) || NUMBERED_LINE.test(next)) break;
      paragraph.push(next);
      index += 1;
    }
    if (paragraph.length > 0) {
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
    }
  }

  return html.join("\n");
}

function renderTable(rows: string[][]): string {
  if (rows.length === 0) return "";
  const [header, ...body] = rows;
  const headerCells = header.map((cell) => `<th>${renderInline(cell)}</th>`).join("");
  const bodyRows = body
    .map((row) => {
      // The signature table's source rows are ragged; pad so columns line up.
      const cells = Array.from(
        { length: header.length },
        (_, i) => `<td>${renderInline(row[i] ?? "")}</td>`,
      ).join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

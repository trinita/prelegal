import { describe, expect, it } from "vitest";
import { escapeHtml, renderMarkdown } from "./markdown";

describe("escapeHtml", () => {
  it("escapes the characters that could introduce markup", () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;",
    );
  });

  it("escapes ampersands before other entities, so they are not doubled", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("headings and paragraphs", () => {
  it("renders headings at the right level", () => {
    expect(renderMarkdown("# One")).toBe("<h1>One</h1>");
    expect(renderMarkdown("### Three")).toBe("<h3>Three</h3>");
  });

  it("joins wrapped lines into a single paragraph", () => {
    expect(renderMarkdown("first line\nsecond line")).toBe(
      "<p>first line second line</p>",
    );
  });

  it("separates paragraphs on a blank line", () => {
    expect(renderMarkdown("one\n\ntwo")).toBe("<p>one</p>\n<p>two</p>");
  });

  it("ends a paragraph when a heading follows without a blank line", () => {
    expect(renderMarkdown("text\n## Next")).toBe("<p>text</p>\n<h2>Next</h2>");
  });
});

describe("inline formatting", () => {
  it("renders bold text", () => {
    expect(renderMarkdown("a **bold** word")).toBe(
      "<p>a <strong>bold</strong> word</p>",
    );
  });

  it("renders links, opening them safely in a new tab", () => {
    const html = renderMarkdown("see [the terms](https://example.com/x)");
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it("leaves a non-http link target alone", () => {
    // Only http(s) targets are turned into links, so javascript: cannot slip in.
    const html = renderMarkdown("[click](javascript:alert(1))");
    expect(html).not.toContain("<a ");
  });
});

describe("editing hints", () => {
  it("strips <label> hints, which are not part of the agreement", () => {
    const html = renderMarkdown("### Purpose\n<label>How it may be used</label>\n\nText");
    expect(html).not.toContain("How it may be used");
    expect(html).toContain("<h3>Purpose</h3>");
  });
});

describe("checkbox choices", () => {
  it("marks the selected option and states it for screen readers", () => {
    const html = renderMarkdown("- [x] Chosen\n- [ ] Other");

    expect(html).toContain('class="choice choice-selected"');
    expect(html).toContain("☒");
    expect(html).toContain("☐");
    expect(html).toContain('<span class="visually-hidden">Selected:</span>');
    expect(html).toContain('<span class="visually-hidden">Not selected:</span>');
  });

  it("groups consecutive choices into one list", () => {
    const html = renderMarkdown("- [x] A\n- [ ] B\n- [ ] C");
    expect(html.match(/<ul class="choices">/g)).toHaveLength(1);
    expect(html.match(/<li /g)).toHaveLength(3);
  });
});

describe("numbered clauses", () => {
  it("keeps clauses separated by blank lines in a single list", () => {
    // The standard terms separate every clause with a blank line, and they must
    // still number continuously.
    const html = renderMarkdown("1. First\n\n2. Second\n\n3. Third");

    expect(html.match(/<ol/g)).toHaveLength(1);
    expect(html.match(/<li>/g)).toHaveLength(3);
  });

  it("starts the list at the number given", () => {
    expect(renderMarkdown("5. Fifth")).toContain('<ol start="5">');
  });
});

describe("tables", () => {
  it("renders a header row and body rows", () => {
    const html = renderMarkdown("| A | B |\n|---|---|\n| 1 | 2 |");

    expect(html).toContain("<th>A</th>");
    expect(html).toContain("<td>1</td>");
    expect(html).not.toContain("---");
  });

  it("pads ragged rows so columns stay aligned", () => {
    // The source signature table has rows with fewer cells than the header.
    const html = renderMarkdown("|| P1 | P2 |\n|:--|:--:|:--:|\n| Name | |\n");
    const row = html.match(/<tr><td>Name<\/td>.*?<\/tr>/s)?.[0] ?? "";

    expect(row.match(/<td>/g)).toHaveLength(3);
  });

  it("handles a leading empty header cell", () => {
    const html = renderMarkdown("|| P1 | P2 |\n|:--|:--:|:--:|\n| Row | a | b |");
    expect(html).toContain("<th></th>");
  });
});

describe("robustness", () => {
  it("returns nothing for empty input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   \n\n  ")).toBe("");
  });

  it("does not hang on a table that ends the document", () => {
    expect(renderMarkdown("| A |\n|---|\n| 1 |")).toContain("<td>1</td>");
  });

  it("does not hang on a choice list that ends the document", () => {
    expect(renderMarkdown("- [x] Only")).toContain("choice-selected");
  });
});

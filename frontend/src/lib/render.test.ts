import { describe, expect, it } from "vitest";
import { formatEffectiveDate, renderDocument } from "./render";
import { defaultValues, type MndaValues } from "./fields";

/** A fully completed agreement, used where a filled document is needed. */
function completed(overrides: Partial<MndaValues> = {}): MndaValues {
  return {
    ...defaultValues(),
    effectiveDate: "2026-03-15",
    governingLaw: "Delaware",
    jurisdiction: "New Castle, DE",
    partyOne: {
      printName: "Ada Lovelace",
      title: "CEO",
      company: "Analytical Engines Ltd",
      noticeAddress: "ada@example.com",
    },
    partyTwo: {
      printName: "Alan Turing",
      title: "CTO",
      company: "Bombe Systems Inc",
      noticeAddress: "alan@example.com",
    },
    ...overrides,
  };
}

/** Rendered HTML with tags removed, for asserting on readable text. */
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

/**
 * What the reader actually sees: tags removed and entities decoded, so a
 * character escaped to keep it inert still reads as itself.
 */
const visible = (html: string) =>
  text(html)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

describe("cover page", () => {
  it("fills in the values the user supplied", () => {
    const html = renderDocument(completed()).coverPageHtml;
    const body = text(html);

    expect(body).toContain("15 March 2026");
    expect(body).toContain("Delaware");
    expect(body).toContain("New Castle, DE");
    expect(body).toContain("Ada Lovelace");
    expect(body).toContain("Bombe Systems Inc");
  });

  it("leaves the signature and date rows blank to be completed by hand", () => {
    const html = renderDocument(completed()).coverPageHtml;
    const signatureRow = /<tr><td>Signature<\/td><td><\/td><td><\/td><\/tr>/;
    const dateRow = /<tr><td>Date<\/td><td><\/td><td><\/td><\/tr>/;

    expect(html).toMatch(signatureRow);
    expect(html).toMatch(dateRow);
  });

  it("records 'None.' when no modifications are given", () => {
    expect(text(renderDocument(completed()).coverPageHtml)).toContain("None.");
  });

  it("keeps the Common Paper attribution from the template", () => {
    expect(text(renderDocument(completed()).coverPageHtml)).toContain(
      "free to use under",
    );
  });

  it("states that the template was adapted, as CC BY 4.0 requires", () => {
    const html = renderDocument(completed()).coverPageHtml;
    expect(html).toContain("modification-notice");
    expect(text(html)).toContain("Adapted from the Common Paper");
  });
});

describe("term selection", () => {
  it("ticks the years option and reflects the number given", () => {
    const html = renderDocument(
      completed({ mndaTermType: "expires", mndaTermYears: "3" }),
    ).coverPageHtml;

    expect(text(html)).toContain("☒Selected:Expires 3 years from Effective Date.");
    expect(text(html)).toContain("☐Not selected:Continues until terminated");
  });

  it("ticks the alternative when it is chosen", () => {
    const html = renderDocument(
      completed({ mndaTermType: "untilTerminated" }),
    ).coverPageHtml;

    expect(text(html)).toContain("☐Not selected:Expires");
    expect(text(html)).toContain("☒Selected:Continues until terminated");
  });

  it("ticks perpetuity for the confidentiality term", () => {
    const html = renderDocument(
      completed({ confidentialityTermType: "perpetual" }),
    ).coverPageHtml;

    expect(text(html)).toContain("☒Selected:In perpetuity.");
  });

  it("says 'year' rather than 'years' for a single year", () => {
    const html = renderDocument(
      completed({ mndaTermType: "expires", mndaTermYears: "1" }),
    ).coverPageHtml;

    expect(text(html)).toContain("Expires 1 year from");
    expect(text(html)).not.toContain("Expires 1 years from");
  });

  it("states the selection in text for screen readers", () => {
    const html = renderDocument(completed()).coverPageHtml;
    expect(html).toContain('<span class="visually-hidden">Selected:</span>');
    expect(html).toContain('<span class="visually-hidden">Not selected:</span>');
  });
});

describe("standard terms", () => {
  it("refers to cover page fields by their defined term, not their value", () => {
    // The clauses read "solely for the Purpose" and "provisions of such
    // Governing Law". Substituting the value there breaks the sentence and
    // alters the legal text.
    const body = text(renderDocument(completed()).standardTermsHtml);

    expect(body).toContain("solely for the Purpose");
    expect(body).toContain("commences on the Effective Date");
    expect(body).toContain("expires at the end of the MNDA Term");
    expect(body).toContain("provisions of such Governing Law");
    expect(body).not.toContain("solely for the Evaluating whether");
    expect(body).not.toContain("State of Delaware");
  });

  it("does not vary with the values entered", () => {
    const a = renderDocument(completed()).standardTermsHtml;
    const b = renderDocument(
      completed({ governingLaw: "California", mndaTermYears: "9" }),
    ).standardTermsHtml;

    expect(a).toBe(b);
  });
});

describe("escaping user input", () => {
  it("escapes HTML so markup cannot be injected", () => {
    const html = renderDocument(
      completed({ modifications: "<script>alert(1)</script>" }),
    ).coverPageHtml;

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps a pipe in a party field from splitting the signature table", () => {
    // A notice address like "a@b.com | +1 555" would otherwise open a new
    // markdown cell and push the other party's details out of the row.
    const html = renderDocument(
      completed({
        partyOne: {
          printName: "Ada",
          title: "CEO",
          company: "Acme",
          noticeAddress: "support@acme.com | +1 555-1234",
        },
      }),
    ).coverPageHtml;

    const row = html.match(/<tr><td>Notice Address<\/td>.*?<\/tr>/s)?.[0] ?? "";
    expect(row.match(/<td>/g)).toHaveLength(3);
    expect(row).toContain("&#124;");
    expect(row).toContain("alan@example.com");
  });

  it("keeps newlines from creating new markdown structure", () => {
    const html = renderDocument(
      completed({ purpose: "Evaluate a partnership.\n# Heading\n- list item" }),
    ).coverPageHtml;

    expect(html).not.toMatch(/<h1>Heading/);
    expect(html).not.toMatch(/<li>list item/);
    expect(html).toContain("<br />");
  });

  it("produces balanced markup even for multi-line input", () => {
    const html = renderDocument(
      completed({ purpose: "One.\n\nTwo.", modifications: "A.\nB." }),
    ).coverPageHtml;

    const count = (pattern: RegExp) => html.match(pattern)?.length ?? 0;
    expect(count(/<span\b[^>]*>/g)).toBe(count(/<\/span>/g));
    expect(count(/<p\b[^>]*>/g)).toBe(count(/<\/p>/g));
  });
});

describe("unfilled values", () => {
  it("marks missing values as unfilled rather than filled in", () => {
    const html = renderDocument(defaultValues()).coverPageHtml;

    expect(html).toContain('<span class="unfilled">__________</span>');
    expect(html).not.toContain('<span class="filled">__________</span>');
  });

  it("still renders a complete document when nothing has been entered", () => {
    const html = renderDocument(defaultValues()).coverPageHtml;

    expect(text(html)).toContain("Mutual Non-Disclosure Agreement");
    expect(text(html)).toContain("PARTY 1");
  });
});

describe("formatEffectiveDate", () => {
  it("formats an ISO date as a long-form date", () => {
    expect(formatEffectiveDate("2026-03-15")).toBe("15 March 2026");
  });

  it("does not shift the date for viewers behind UTC", () => {
    // `new Date("2026-01-01")` is UTC midnight and formats as 31 December in
    // negative-offset timezones; the parts are parsed manually to avoid this.
    expect(formatEffectiveDate("2026-01-01")).toBe("1 January 2026");
  });

  it("returns a blank placeholder for an empty date", () => {
    expect(formatEffectiveDate("")).toContain("____");
  });

  it("passes through anything that is not an ISO date", () => {
    expect(formatEffectiveDate("not a date")).toBe("not a date");
  });
});

describe("determinism", () => {
  it("renders identically for identical input, so hydration cannot drift", () => {
    expect(renderDocument(completed())).toEqual(renderDocument(completed()));
    expect(renderDocument(defaultValues())).toEqual(
      renderDocument(defaultValues()),
    );
  });
});

describe("markdown syntax in user input", () => {
  it("does not let a user's text become bold in the agreement", () => {
    const html = renderDocument(
      completed({ purpose: "Evaluate **the acquisition** carefully." }),
    ).coverPageHtml;

    expect(html).not.toContain("<strong>the acquisition</strong>");
    // The asterisks survive as characters the reader sees, just not as markup.
    expect(visible(html)).toContain("**the acquisition**");
  });

  it("does not let a user's text become a hyperlink in the agreement", () => {
    // A link in the operative text of a signed document must not be creatable
    // by typing into a form field.
    const html = renderDocument(
      completed({ purpose: "See [pricing sheet](https://example.com/x)." }),
    ).coverPageHtml;

    expect(html).not.toContain('href="https://example.com/x"');
  });

  it("keeps markdown syntax inert in party details too", () => {
    const html = renderDocument(
      completed({
        partyOne: {
          printName: "Ada",
          title: "CEO",
          company: "**Acme**",
          noticeAddress: "[here](https://example.com)",
        },
      }),
    ).coverPageHtml;

    expect(html).not.toContain("<strong>Acme</strong>");
    expect(html).not.toContain('href="https://example.com"');
  });
});

describe("incomplete term lengths", () => {
  it("shows a blank, not a broken sentence, while the years field is empty", () => {
    // Reachable by backspacing the number before typing a new one.
    const html = renderDocument(
      completed({ mndaTermType: "expires", mndaTermYears: "" }),
    ).coverPageHtml;

    expect(text(html)).not.toContain("Expires  years from");
    expect(html).toContain('<span class="unfilled">');
  });

  it("does not present a zero or negative term as filled in", () => {
    for (const years of ["0", "-2"]) {
      const html = renderDocument(
        completed({ mndaTermType: "expires", mndaTermYears: years }),
      ).coverPageHtml;

      expect(html, `years=${years}`).not.toContain(
        `<span class="filled">${years} year`,
      );
    }
  });

  it("applies the same rule to the confidentiality term", () => {
    const html = renderDocument(
      completed({ confidentialityTermType: "years", confidentialityYears: "" }),
    ).coverPageHtml;

    expect(text(html)).not.toContain("  years from Effective Date, but");
  });
});

/** The paragraph immediately following a given heading in the document. */
function sectionUnder(html: string, heading: string): string {
  const match = new RegExp(`<h3>${heading}</h3>\\s*<p>(.*?)</p>`, "s").exec(html);
  if (!match) throw new Error(`No section found under heading ${heading}`);
  return visible(match[1]);
}

describe("substitution is order-independent", () => {
  it("does not mistake text the user typed for a later placeholder", () => {
    // Substituting one placeholder at a time over the growing document meant a
    // user could type a later placeholder's own wording and have the two values
    // swap places. Asserting only that both strings appear somewhere would not
    // catch that, so each is checked in its own section.
    const html = renderDocument(
      completed({
        purpose: "List any modifications to the MNDA",
        modifications: "Clause 5 amended.",
      }),
    ).coverPageHtml;

    expect(sectionUnder(html, "Purpose")).toContain(
      "List any modifications to the MNDA",
    );
    expect(sectionUnder(html, "MNDA Modifications")).toContain("Clause 5 amended.");
    expect(sectionUnder(html, "MNDA Modifications")).not.toContain(
      "List any modifications",
    );
  });

  it("still fills every field when one value repeats the template's wording", () => {
    const html = renderDocument(
      completed({ purpose: "[Fill in state] and [Today’s date]" }),
    ).coverPageHtml;

    const body = visible(html);
    expect(body).toContain("Governing Law: Delaware");
    expect(sectionUnder(html, "Effective Date")).toContain("15 March 2026");
    expect(sectionUnder(html, "Purpose")).toContain("[Fill in state]");
  });
});

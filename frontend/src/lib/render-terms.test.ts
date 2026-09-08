import { describe, expect, it } from "vitest";
import { GENERATED_DOCUMENTS, findDocument, type DocumentSpec } from "./documents";
import { renderTermsDocument } from "./render-terms";

const pilot = findDocument("pilot-agreement") as DocumentSpec;
const csa = findDocument("cloud-service-agreement") as DocumentSpec;

/** What a reader sees: markup stripped, entities resolved back to characters. */
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ");

describe("the key terms page", () => {
  it("states every term the document's clauses refer to", () => {
    const { keyTermsHtml } = renderTermsDocument(pilot, {});

    for (const field of pilot.fields) {
      expect(text(keyTermsHtml)).toContain(field.term);
    }
  });

  it("shows the values given", () => {
    const { keyTermsHtml } = renderTermsDocument(pilot, {
      provider: "Acme Robotics",
      pilotPeriod: "60 days from the effective date",
    });

    expect(text(keyTermsHtml)).toContain("Acme Robotics");
    expect(text(keyTermsHtml)).toContain("60 days from the effective date");
  });

  it("marks a term nobody has answered as unfilled, not as empty", () => {
    const { keyTermsHtml } = renderTermsDocument(pilot, {});

    expect(keyTermsHtml).toContain('class="unfilled"');
    expect(keyTermsHtml).not.toContain('class="filled"');
  });

  it("heads the signature table with the parties once they are known", () => {
    const { keyTermsHtml } = renderTermsDocument(pilot, {
      provider: "Acme Robotics",
      customer: "Umbrella Health",
    });

    expect(text(keyTermsHtml)).toContain("Acme Robotics");
    expect(text(keyTermsHtml)).toContain("Umbrella Health");
    expect(text(keyTermsHtml)).toContain("Signature");
  });

  it("still prints a signable table before anyone is named", () => {
    const { keyTermsHtml } = renderTermsDocument(pilot, {});

    expect(text(keyTermsHtml)).toContain("Provider");
    expect(text(keyTermsHtml)).toContain("Print Name");
  });

  it("prints a date as it should read, not as it is recorded", () => {
    // The assistant records ISO; a signed agreement should not say 2027-04-01.
    const { keyTermsHtml } = renderTermsDocument(pilot, {
      effectiveDate: "2027-04-01",
    });

    expect(text(keyTermsHtml)).toContain("1 April 2027");
    expect(text(keyTermsHtml)).not.toContain("2027-04-01");
  });

  it("says the work was adapted, as CC BY 4.0 requires", () => {
    const { keyTermsHtml } = renderTermsDocument(pilot, {});

    expect(keyTermsHtml).toContain("modification-notice");
    expect(text(keyTermsHtml)).toContain("Adapted from the Common Paper");
  });

  it("links the licence, which CC BY 4.0 asks for alongside the credit", () => {
    // These ten documents carry no licence line of their own, unlike the
    // Mutual NDA's published cover page, so without this the generated
    // document would meet only two of the licence's three conditions.
    const { keyTermsHtml } = renderTermsDocument(pilot, {});

    expect(keyTermsHtml).toContain("https://creativecommons.org/licenses/by/4.0/");
  });

  it("heads the signature columns in the order the document introduces them", () => {
    // Every one of these says "identifies Provider and Customer"; taking the
    // fields in their own order sorts them alphabetically and reverses it.
    const { keyTermsHtml } = renderTermsDocument(pilot, {
      provider: "Acme Robotics",
      customer: "Umbrella Health",
    });

    // The second table is the signature block; the first lists the terms, in
    // their own order.
    const signatureTable = keyTermsHtml.split("<table>")[2];

    expect(signatureTable).toContain("Signature");
    expect(signatureTable.indexOf("Acme Robotics")).toBeLessThan(
      signatureTable.indexOf("Umbrella Health"),
    );
  });
});

describe("the standard terms", () => {
  it("keeps the legal wording exactly as the template has it", () => {
    // The clauses read with the defined term — "during the Pilot Period" —
    // so a value must never be substituted into them.
    const filled = renderTermsDocument(pilot, {
      pilotPeriod: "60 days",
      provider: "Acme Robotics",
    }).standardTermsHtml;
    const empty = renderTermsDocument(pilot, {}).standardTermsHtml;

    expect(filled).toBe(empty);
    expect(text(filled)).not.toContain("Acme Robotics");
  });

  it("marks up references written as key terms, order form or cover page", () => {
    // Three conventions appear across the templates; a term is a term.
    const pilotHtml = renderTermsDocument(pilot, {}).standardTermsHtml;
    const csaHtml = renderTermsDocument(csa, {}).standardTermsHtml;

    expect(pilotHtml).toContain('class="defined-term"');
    expect(csaHtml).toContain('class="defined-term"');
    expect(pilotHtml).not.toContain("orderform_link");
    expect(csaHtml).not.toContain("keyterms_link");
    expect(csaHtml).not.toContain("coverpage_link");
  });

  it("keeps a possessive reading as the sentence wrote it", () => {
    const html = renderTermsDocument(csa, {}).standardTermsHtml;

    expect(text(html)).toMatch(/Provider[’']s/);
  });

  it("keeps the Common Paper attribution the template carries", () => {
    expect(text(renderTermsDocument(pilot, {}).standardTermsHtml)).toContain(
      "Common Paper",
    );
  });
});

describe("every document in the catalogue", () => {
  it.each(GENERATED_DOCUMENTS.map((d) => [d.id, d] as const))(
    "renders %s completely",
    (_id, document) => {
      const { keyTermsHtml, standardTermsHtml } = renderTermsDocument(document, {});

      expect(text(keyTermsHtml)).toContain(document.name);
      expect(standardTermsHtml.length).toBeGreaterThan(1000);
      // Nothing may reach the page as a raw template span.
      expect(standardTermsHtml).not.toMatch(/_link"/);
    },
  );

  it.each(GENERATED_DOCUMENTS.map((d) => [d.id, d] as const))(
    "knows every term %s refers to",
    (_id, document) => {
      const source = renderTermsDocument(document, {}).standardTermsHtml;
      // An unknown reference renders with an empty class; that would mean the
      // template refers to something the catalogue never asks the user about.
      expect(source).not.toContain('<span class="">');
    },
  );
});

describe("escaping", () => {
  it("keeps a pipe from splitting the key terms table", () => {
    const { keyTermsHtml } = renderTermsDocument(pilot, {
      provider: "Acme | Robotics",
    });

    // The pipe survives as an entity, so the table keeps its shape while the
    // reader still sees the name they typed.
    expect(keyTermsHtml).toContain("&#124;");
    expect(keyTermsHtml).not.toMatch(/\| Acme \| Robotics \|/);
    expect(text(keyTermsHtml)).toContain("Acme | Robotics");
  });

  it("does not let typed markdown become real markup", () => {
    const { keyTermsHtml } = renderTermsDocument(pilot, {
      provider: "**Acme** [here](http://evil.example)",
    });

    expect(keyTermsHtml).not.toContain("<strong>");
    // The page carries one link of its own — the CC BY licence — so this asks
    // whether the user's text became one, not whether any link exists.
    expect(keyTermsHtml).not.toContain("evil.example\"");
    expect(keyTermsHtml).not.toMatch(/<a [^>]*evil\.example/);
  });

  it("escapes HTML so markup cannot be injected", () => {
    const { keyTermsHtml } = renderTermsDocument(pilot, {
      provider: "<script>alert(1)</script>",
    });

    expect(keyTermsHtml).not.toContain("<script>");
  });
});

/**
 * The catalogue against the templates it claims to describe.
 *
 * `documents.json` says which defined terms each document uses, and the app
 * asks the user for exactly those. Nothing at runtime forces that list to match
 * the template, so a term added to a Common Paper document — or a field left
 * behind when one is removed — would otherwise show up as a clause referring to
 * something nobody was ever asked about.
 *
 * This is the same guarantee `render-guard.test.ts` gives the Mutual NDA, and
 * the reason `sync-templates.mjs` copies the legal text in rather than
 * restating it.
 */
import { describe, expect, it } from "vitest";
import { standardTermsById } from "@/templates/sources";
import { GENERATED_DOCUMENTS } from "./documents";

/** Every defined-term reference in a template, however it is spelled. */
function referencedTerms(source: string): Set<string> {
  const pattern =
    /<span class="(?:coverpage|keyterms|orderform|sow|businessterms)_link"[^>]*>(.*?)<\/span>/g;
  const found = new Set<string>();

  for (const [, raw] of source.matchAll(pattern)) {
    found.add(raw.replace(/[’']s$/, "").trim());
  }

  return found;
}

describe.each(GENERATED_DOCUMENTS.map((d) => [d.id, d] as const))(
  "%s",
  (_id, document) => {
    const source = standardTermsById[document.id];
    const referenced = referencedTerms(source);
    const declared = new Set(document.fields.flatMap((field) => field.termForms));
    // A price, and what is being sold. Common Paper expects a separate Order
    // Form to carry these, so no clause links to them — but a subscription
    // agreement that never says what it costs is not a usable document.
    const unreferenced = document.fields.filter((field) => !field.referenced);

    it("has its Standard Terms synced", () => {
      expect(source, `no template synced for ${document.id}`).toBeTruthy();
    });

    it("asks about every term its clauses refer to", () => {
      const missing = [...referenced].filter((term) => !declared.has(term));

      expect(missing, "referenced by the template, never asked about").toEqual([]);
    });

    it("asks about nothing its clauses never mention, unless it says why", () => {
      const extra = [...declared].filter((term) => !referenced.has(term));

      expect(extra, "asked about, but not in the template").toEqual([]);
    });

    it("gives a field no clause references no spellings to match", () => {
      // Otherwise it would mark up prose that means something else.
      for (const field of unreferenced) {
        expect(field.termForms, `${field.name}`).toEqual([]);
      }
    });

    it("gives every field a term, a label and a description", () => {
      for (const field of document.fields) {
        expect(field.term.trim(), `${field.name} has no term`).not.toBe("");
        expect(field.label.trim(), `${field.name} has no label`).not.toBe("");
        expect(field.description.trim(), `${field.name} has no description`).not.toBe("");
        if (field.referenced) {
          expect(field.termForms.length, `${field.name} has no spellings`).toBeGreaterThan(0);
        }
      }
    });

    it("names each field only once", () => {
      const names = document.fields.map((field) => field.name);

      expect(names).toHaveLength(new Set(names).size);
    });
  },
);

describe("the catalogue as a whole", () => {
  it("covers every template except the MNDA's two halves", () => {
    // catalog.json lists twelve templates: the MNDA's standard terms and cover
    // page are handled by render.ts, and the other ten belong here.
    expect(GENERATED_DOCUMENTS).toHaveLength(10);
  });

  it("gives every document a distinct id", () => {
    const ids = GENERATED_DOCUMENTS.map((d) => d.id);

    expect(ids).toHaveLength(new Set(ids).size);
  });

  it("offers aliases, since people do not ask for documents by their formal name", () => {
    for (const document of GENERATED_DOCUMENTS) {
      expect(document.aliases.length, `${document.id} has no aliases`).toBeGreaterThan(0);
    }
  });
});

describe("what is being bought, and for how much", () => {
  // Common Paper puts the price and the product on an Order Form, which this
  // product does not generate. Without these the assistant would call a
  // subscription agreement ready to sign while it said neither.
  it.each(["cloud-service-agreement", "software-license-agreement", "pilot-agreement"])(
    "%s asks the price and names what is sold",
    (id) => {
      const document = GENERATED_DOCUMENTS.find((d) => d.id === id)!;
      const terms = document.fields.map((field) => field.term);

      expect(terms).toContain("Fees");
      expect(terms.some((term) => /Service|Software|Product/.test(term))).toBe(true);
    },
  );
});

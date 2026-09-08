/**
 * The documents this product can generate, besides the Mutual NDA.
 *
 * `documents.json` at the repository root is the single definition, copied in
 * verbatim at build time by sync-templates.mjs — the same arrangement that
 * keeps the legal text from drifting. The backend reads the same file to build
 * what it asks the assistant for, so the form and the conversation always
 * describe the same document.
 */
import { catalogueSource } from "@/templates/sources";

export interface DocumentField {
  name: string;
  /** The defined term as the Standard Terms write it, e.g. "Effective Date". */
  term: string;
  /**
   * Every spelling the clauses use for this term — possessives and plurals
   * included. A reference the renderer does not recognise is one the user was
   * never asked about, so all of them are listed rather than guessed at.
   */
  termForms: string[];
  /**
   * False for a term no clause links to, but that the document would be
   * unusable without: Common Paper expects a separate Order Form to carry the
   * price and name the product, and this product generates one page.
   */
  referenced: boolean;
  type: "string" | "date" | "enum";
  label: string;
  required: boolean;
  description: string;
  enum?: string[];
}

export interface DocumentSpec {
  id: string;
  name: string;
  summary: string;
  aliases: string[];
  template: string;
  fields: DocumentField[];
}

/** Values for a generated document, keyed by field name. */
export type TermValues = Record<string, string>;

export const MUTUAL_NDA_ID = "mutual-nda";

const catalogue: { documents: DocumentSpec[] } = JSON.parse(catalogueSource);

export const GENERATED_DOCUMENTS = catalogue.documents;

export function findDocument(id: string | null): DocumentSpec | null {
  if (id === null) return null;
  return GENERATED_DOCUMENTS.find((document) => document.id === id) ?? null;
}

/** Every document, for anywhere that lists what can be drafted. */
export const DOCUMENT_NAMES: Record<string, string> = {
  [MUTUAL_NDA_ID]: "Mutual Non-Disclosure Agreement",
  ...Object.fromEntries(GENERATED_DOCUMENTS.map((d) => [d.id, d.name])),
};

export function outstandingTerms(
  document: DocumentSpec,
  values: TermValues,
): string[] {
  return document.fields
    .filter((field) => field.required && !(values[field.name] ?? "").trim())
    .map((field) => field.term);
}

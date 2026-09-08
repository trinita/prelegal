/**
 * The frontend's field definitions against the shared schema.
 *
 * `mnda-fields.json` at the repository root is what the backend gives the
 * assistant. This file is what the form and the completeness check use. They
 * describe the same legal document, in two languages, and nothing at runtime
 * forces them to agree — so a field added to one and missed in the other would
 * otherwise show up as a gap in a signed agreement.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REQUIREMENTS, US_STATES, defaultValues, type MndaValues } from "./fields";

interface SharedField {
  name: string;
  type: string;
  label: string;
  required: boolean;
  description: string;
  enum?: string[];
  default?: string;
  requiredWhen?: { field: string; equals: string };
}

const shared: { fields: SharedField[] } = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../../mnda-fields.json", import.meta.url)),
    "utf8",
  ),
);

/** Reads "partyOne.company" out of a values object. */
function valueAt(values: MndaValues, name: string): unknown {
  return name
    .split(".")
    .reduce<unknown>(
      (current, step) =>
        typeof current === "object" && current !== null
          ? (current as Record<string, unknown>)[step]
          : undefined,
      values,
    );
}

describe("the shared field schema", () => {
  it("names only fields the form actually has", () => {
    const values = defaultValues();

    for (const field of shared.fields) {
      expect(
        valueAt(values, field.name),
        `${field.name} is in mnda-fields.json but not in MndaValues`,
      ).toBeTypeOf("string");
    }
  });

  it("covers every field the form has", () => {
    const named = new Set(shared.fields.map((field) => field.name));
    const missing: string[] = [];

    const walk = (value: unknown, prefix: string) => {
      if (typeof value === "string") {
        if (!named.has(prefix)) missing.push(prefix);
        return;
      }
      for (const [key, nested] of Object.entries(value as object)) {
        walk(nested, prefix === "" ? key : `${prefix}.${key}`);
      }
    };

    walk(defaultValues(), "");

    expect(missing, "fields the assistant would never be told about").toEqual([]);
  });

  it("offers the assistant exactly the states the form offers", () => {
    const governingLaw = shared.fields.find((f) => f.name === "governingLaw");

    expect(governingLaw?.enum).toEqual([...US_STATES]);
  });

  it("agrees with the form about which fields are required", () => {
    // The labels differ by design — the schema is machine-facing and the
    // requirements are what a person reads — so this compares the counts and
    // the optional ones by name.
    const optional = shared.fields
      .filter((field) => !field.required)
      .map((field) => field.name)
      .sort();

    expect(optional).toEqual(["modifications", "partyOne.title", "partyTwo.title"]);

    // The form folds each term type and its year count into one requirement,
    // which is why 14 required fields correspond to 12 checks.
    expect(shared.fields.filter((field) => field.required)).toHaveLength(14);
    expect(REQUIREMENTS).toHaveLength(12);
  });

  it("carries the same defaults the form starts from", () => {
    // The assistant treats a value still equal to its default as one nobody has
    // agreed to. If these drifted, it would either nag about a value the user
    // chose or quietly accept one they never saw.
    const values = defaultValues();

    for (const field of shared.fields) {
      if (field.default === undefined) continue;
      expect(valueAt(values, field.name), `${field.name}`).toBe(field.default);
    }
  });

  it("marks as defaulted exactly the fields the form pre-fills", () => {
    const prefilled: string[] = [];

    const walk = (value: unknown, prefix: string) => {
      if (typeof value === "string") {
        if (value !== "") prefilled.push(prefix);
        return;
      }
      for (const [key, nested] of Object.entries(value as object)) {
        walk(nested, prefix === "" ? key : `${prefix}.${key}`);
      }
    };
    walk(defaultValues(), "");

    const declared = shared.fields
      .filter((field) => field.default !== undefined)
      .map((field) => field.name);

    expect(declared.sort()).toEqual(prefilled.sort());
  });

  it("makes the year counts conditional on their own term type", () => {
    // The form treats these as required only when the term has a length; the
    // assistant has to agree, or it will call a document ready that the preview
    // still shows as incomplete.
    const conditional = Object.fromEntries(
      shared.fields
        .filter((field) => field.requiredWhen)
        .map((field) => [field.name, field.requiredWhen]),
    );

    expect(conditional).toEqual({
      mndaTermYears: { field: "mndaTermType", equals: "expires" },
      confidentialityYears: { field: "confidentialityTermType", equals: "years" },
    });
  });

  it("gives every field a plain-language label, free of code words", () => {
    for (const field of shared.fields) {
      expect(field.label.trim(), `${field.name} has no label`).not.toBe("");
      // The label is what the assistant says out loud; the name never is.
      expect(field.label).not.toContain(".");
      expect(field.label.toLowerCase()).toBe(field.label);
    }
  });

  it("describes every field, since that is the assistant's only guidance", () => {
    for (const field of shared.fields) {
      expect(field.description.trim(), `${field.name} has no description`).not.toBe("");
    }
  });
});

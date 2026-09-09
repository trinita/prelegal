import { describe, expect, it } from "vitest";
import {
  emptyWorkspace,
  isRenderable,
  restoreDocument,
  startDocument,
} from "./workspace";
import { MUTUAL_NDA_ID } from "./documents";
import { defaultValues } from "./fields";

describe("a workspace's record id", () => {
  it("is absent until the document has been saved", () => {
    expect(emptyWorkspace().recordId).toBeNull();
    expect(startDocument(MUTUAL_NDA_ID).recordId).toBeNull();
  });

  it("is separate from the document id", () => {
    /**
     * One says which of the eleven templates is being drafted; the other says
     * which saved row this is. Conflating them would put a database id where a
     * catalogue id is expected.
     */
    const restored = restoreDocument(7, "pilot-agreement", { provider: "Acme" });

    expect(restored.recordId).toBe(7);
    expect(restored.documentId).toBe("pilot-agreement");
  });
});

describe("restoring a saved document", () => {
  it("brings back the values it was saved with", () => {
    const restored = restoreDocument(1, "pilot-agreement", { provider: "Acme" });

    expect(restored.values).toEqual({ provider: "Acme" });
  });

  it("fills in the Mutual NDA's template defaults it was saved without", () => {
    /** A document saved before it was filled in still opens as a usable one. */
    const restored = restoreDocument(1, MUTUAL_NDA_ID, {});

    expect(restored.values).toEqual(defaultValues());
  });

  it("keeps the answers given over the template defaults", () => {
    const restored = restoreDocument(1, MUTUAL_NDA_ID, { governingLaw: "Delaware" });

    expect(restored.values).toMatchObject({
      governingLaw: "Delaware",
      purpose: defaultValues().purpose,
    });
  });

  it("is renderable, so a reopened document shows immediately", () => {
    expect(isRenderable(restoreDocument(1, MUTUAL_NDA_ID, {}))).toBe(true);
    expect(isRenderable(restoreDocument(1, "pilot-agreement", {}))).toBe(true);
  });

  it("is not renderable if the catalogue has dropped that document", () => {
    expect(isRenderable(restoreDocument(1, "withdrawn-agreement", {}))).toBe(false);
  });
});

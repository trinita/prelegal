import { describe, expect, it, vi } from "vitest";

/**
 * The templates are mocked with a document that has lost one of the
 * placeholders the renderer expects, which is what an edit to
 * `templates/mutual-nda-coverpage.md` would look like from here.
 *
 * This lives in its own file because the mock has to replace the module for the
 * whole test run.
 */
vi.mock("@/templates/sources", () => ({
  coverPageSource: "# Cover Page\n\nGoverning Law: [Fill in state]\n",
  standardTermsSource: "# Standard Terms\n\n1. Nothing to see here.\n",
}));

const { renderDocument } = await import("./render");
const { defaultValues } = await import("./fields");

describe("template guard", () => {
  it("refuses to render when a placeholder has gone missing", () => {
    // Silently emitting a document that still carries the template's own
    // placeholder text would be far worse than failing.
    expect(() => renderDocument(defaultValues())).toThrow(
      /no longer contains the expected placeholder/,
    );
  });

  it("names the file to reconcile, so the fix is obvious", () => {
    expect(() => renderDocument(defaultValues())).toThrow(
      /templates\/mutual-nda-coverpage\.md/,
    );
  });

  it("reports which placeholder was not found", () => {
    expect(() => renderDocument(defaultValues())).toThrow(/Evaluating whether/);
  });
});

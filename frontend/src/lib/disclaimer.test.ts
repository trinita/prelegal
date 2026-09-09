/**
 * The draft disclaimer reaches the document itself.
 *
 * These assert against the rendered HTML rather than the banner in the page,
 * because the document is the only part that survives printing — and the PDF is
 * where the warning has to be.
 */
import { describe, expect, it } from "vitest";
import { DRAFT_DISCLAIMER } from "./disclaimer";
import { defaultValues } from "./fields";
import { renderDocument } from "./render";
import { renderTermsDocument } from "./render-terms";
import { GENERATED_DOCUMENTS } from "./documents";

describe("the draft disclaimer", () => {
  it("says the document is a draft, unreviewed, and not advice", () => {
    expect(DRAFT_DISCLAIMER).toMatch(/draft/i);
    expect(DRAFT_DISCLAIMER).toMatch(/not legal advice/i);
    expect(DRAFT_DISCLAIMER).toMatch(/review/i);
  });

  it("appears on the Mutual NDA's cover page", () => {
    const { coverPageHtml } = renderDocument(defaultValues());

    expect(coverPageHtml).toContain(DRAFT_DISCLAIMER);
    expect(coverPageHtml).toContain('class="draft-disclaimer"');
  });

  it.each(GENERATED_DOCUMENTS.map((document) => [document.id, document] as const))(
    "appears on the key terms page of %s",
    (_id, document) => {
      const { keyTermsHtml } = renderTermsDocument(document, {});

      expect(keyTermsHtml).toContain(DRAFT_DISCLAIMER);
    },
  );

  it("is not written into the Standard Terms of any document", () => {
    /**
     * The clauses are reproduced verbatim. A notice spliced in among them would
     * be a modification of the legal text, which is the one thing this project
     * does not do — the disclaimer belongs on the page the app generates.
     */
    expect(renderDocument(defaultValues()).standardTermsHtml).not.toContain(
      DRAFT_DISCLAIMER,
    );

    for (const document of GENERATED_DOCUMENTS) {
      expect(renderTermsDocument(document, {}).standardTermsHtml).not.toContain(
        DRAFT_DISCLAIMER,
      );
    }
  });

  it("stays separate from the CC BY modification notice", () => {
    /** Different obligations; changing one should not disturb the other. */
    const { coverPageHtml } = renderDocument(defaultValues());

    expect(coverPageHtml).toContain('class="draft-disclaimer"');
    expect(coverPageHtml).toContain('class="modification-notice"');
  });
});

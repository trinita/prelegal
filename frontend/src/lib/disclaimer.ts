/**
 * The notice that these documents are drafts.
 *
 * It is written into the document itself, alongside the CC BY modification
 * notice and by the same mechanism, because that is the only part of the page
 * the print stylesheet keeps: a banner in the application chrome would be
 * missing from the moment the PDF left the building, which is exactly when it
 * matters most.
 *
 * A separate paragraph from the modification notice, and a separate class. The
 * two say different things — one is a licence obligation, the other is a
 * warning about relying on the result — and conflating them would make each
 * harder to change without disturbing the other.
 *
 * Nothing here is substituted into the Standard Terms. Those clauses are
 * reproduced verbatim; this sits on the generated page, which is the app's own
 * text to write.
 */
export const DRAFT_DISCLAIMER =
  "Draft for review. This document was generated from a template and has not " +
  "been reviewed by a lawyer. It is not legal advice. Have it reviewed by " +
  "qualified counsel before signing or relying on it.";

/** The paragraph as it appears in a generated document. */
export const draftDisclaimerHtml = () =>
  `<p class="draft-disclaimer">${DRAFT_DISCLAIMER}</p>`;

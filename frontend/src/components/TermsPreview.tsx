"use client";

/**
 * The live document for everything but the Mutual NDA. This is also what gets
 * printed: the print stylesheet hides the rest of the page.
 *
 * The HTML comes from the project's own templates with user values escaped
 * during interpolation (see lib/render-terms.ts), which is why it can be
 * injected directly.
 */
import { useMemo } from "react";
import { renderTermsDocument } from "@/lib/render-terms";
import type { DocumentSpec, TermValues } from "@/lib/documents";

interface Props {
  document: DocumentSpec;
  values: TermValues;
}

export default function TermsPreview({ document, values }: Props) {
  const { keyTermsHtml, standardTermsHtml } = useMemo(
    () => renderTermsDocument(document, values),
    [document, values],
  );

  return (
    <article className="document" id="document">
      <section
        className="document-page"
        dangerouslySetInnerHTML={{ __html: keyTermsHtml }}
      />
      <section
        className="document-page"
        dangerouslySetInnerHTML={{ __html: standardTermsHtml }}
      />
    </article>
  );
}

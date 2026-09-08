"use client";

import { useMemo } from "react";
import { renderDocument } from "@/lib/render";
import type { MndaValues } from "@/lib/fields";

interface Props {
  values: MndaValues;
}

/**
 * The live document. This is also what gets printed: the print stylesheet hides
 * the rest of the page, so what the user sees here is what lands in the PDF.
 *
 * The HTML comes from the project's own templates with user values escaped
 * during interpolation (see lib/render.ts), which is why it can be injected
 * directly.
 */
export default function DocumentPreview({ values }: Props) {
  const { coverPageHtml, standardTermsHtml } = useMemo(
    () => renderDocument(values),
    [values],
  );

  return (
    <article className="document" id="document">
      <section
        className="document-page"
        dangerouslySetInnerHTML={{ __html: coverPageHtml }}
      />
      <section
        className="document-page"
        dangerouslySetInnerHTML={{ __html: standardTermsHtml }}
      />
    </article>
  );
}

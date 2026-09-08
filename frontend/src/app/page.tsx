"use client";

import { useEffect, useState } from "react";
import NdaForm from "@/components/NdaForm";
import DocumentPreview from "@/components/DocumentPreview";
import { defaultValues, outstandingRequirements, type MndaValues } from "@/lib/fields";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";

export default function Home() {
  const [values, setValues] = useState<MndaValues>(defaultValues);
  // The saved draft is read after mount so the server and first client render
  // agree; until then the form shows defaults.
  const [draftLoaded, setDraftLoaded] = useState(false);

  useEffect(() => {
    setValues(loadDraft());
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (draftLoaded) saveDraft(values);
  }, [values, draftLoaded]);

  const outstanding = outstandingRequirements(values);
  const isComplete = outstanding.length === 0;

  const handleReset = () => {
    if (!window.confirm("Clear the form and start a new agreement?")) return;
    clearDraft();
    setValues(defaultValues());
  };

  return (
    <div className="layout">
      <header className="masthead">
        <div>
          <h1>Mutual NDA creator</h1>
          <p>
            Fill in the details and the agreement builds as you type. Based on the{" "}
            <a
              href="https://commonpaper.com/standards/mutual-nda/1.0"
              rel="noreferrer noopener"
              target="_blank"
            >
              Common Paper Mutual NDA v1.0
            </a>
            .
          </p>
        </div>
        <div className="masthead-actions">
          <button type="button" className="button-secondary" onClick={handleReset}>
            Start over
          </button>
          <button type="button" className="button-primary" onClick={() => window.print()}>
            Download PDF
          </button>
        </div>
      </header>

      <main className="panes">
        <section className="pane pane-form" aria-label="Agreement details">
          <NdaForm values={values} onChange={setValues} />
        </section>

        <section className="pane pane-preview" aria-label="Document preview">
          <div className="preview-status" role="status">
            {isComplete ? (
              <p className="status-complete">
                <span aria-hidden="true">✓</span> Ready to sign — all details filled in.
              </p>
            ) : (
              <details>
                <summary>
                  {outstanding.length} detail{outstanding.length === 1 ? "" : "s"} still to
                  fill in
                </summary>
                <ul>
                  {outstanding.map((label) => (
                    <li key={label}>{label}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>

          <DocumentPreview values={values} />
        </section>
      </main>

      <footer className="colophon">
        <p>
          The Common Paper Mutual NDA is free to use and modify under{" "}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            rel="noreferrer noopener"
            target="_blank"
          >
            CC BY 4.0
          </a>
          . This tool produces a draft document and is not legal advice.
        </p>
      </footer>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import NdaForm from "@/components/NdaForm";
import DocumentPreview from "@/components/DocumentPreview";
import { defaultValues, outstandingRequirements, type MndaValues } from "@/lib/fields";
import { clearTranscript } from "@/lib/chat";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";

/** Chat fills the document in; the fields are there to correct it directly. */
type Mode = "chat" | "fields";

/**
 * The Mutual NDA creator, unchanged from PL-6 apart from moving out of
 * `app/page.tsx` so the page can decide whether to show it or the login screen.
 */
export default function NdaCreator() {
  const [values, setValues] = useState<MndaValues>(defaultValues);
  // The saved draft is read after mount so the server and first client render
  // agree; until then the form shows defaults.
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>("chat");
  // Bumped on reset, to remount the chat rather than have it hold a
  // conversation about a document that no longer exists.
  const [conversation, setConversation] = useState(0);

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
    clearTranscript();
    setValues(defaultValues());
    setConversation((count) => count + 1);
    setMode("chat");
  };

  return (
    <div className="layout">
      <header className="masthead">
        <div>
          <h1>Mutual NDA creator</h1>
          <p>
            Tell the assistant what you need and the agreement builds as you talk.
            Based on the{" "}
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
          <div className="mode-switch" role="tablist" aria-label="How to fill in the agreement">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "chat"}
              className={mode === "chat" ? "mode-tab mode-tab-on" : "mode-tab"}
              onClick={() => setMode("chat")}
            >
              Chat
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "fields"}
              className={mode === "fields" ? "mode-tab mode-tab-on" : "mode-tab"}
              onClick={() => setMode("fields")}
            >
              Edit fields
            </button>
          </div>

          {mode === "chat" ? (
            <ChatPanel key={conversation} values={values} onChange={setValues} />
          ) : (
            <NdaForm values={values} onChange={setValues} />
          )}
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

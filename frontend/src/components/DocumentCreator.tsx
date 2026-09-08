"use client";

/**
 * The workspace: a conversation on the left, the document taking shape on the
 * right.
 *
 * It owns what is being drafted and everything said about it, and hands the
 * same values to the chat, the form and the preview — so the three cannot
 * disagree. The Mutual NDA keeps the dedicated form and renderer PL-6 built
 * around its published cover page; the other ten share a form and a renderer
 * driven by the catalogue.
 */
import { useEffect, useState } from "react";
import ChatPanel from "@/components/ChatPanel";
import NdaForm from "@/components/NdaForm";
import TermsForm from "@/components/TermsForm";
import DocumentPreview from "@/components/DocumentPreview";
import TermsPreview from "@/components/TermsPreview";
import { outstandingRequirements, type MndaValues } from "@/lib/fields";
import {
  DOCUMENT_NAMES,
  GENERATED_DOCUMENTS,
  findDocument,
  outstandingTerms,
  type TermValues,
} from "@/lib/documents";
import { clearTranscript } from "@/lib/chat";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";
import {
  emptyWorkspace,
  isMutualNda,
  isRenderable,
  startDocument,
  type Workspace,
} from "@/lib/workspace";

/** Chat fills the document in; the fields are there to correct it directly. */
type Mode = "chat" | "fields";

export default function DocumentCreator() {
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  // The saved draft is read after mount so the server and first client render
  // agree; until then the workspace is empty.
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>("chat");
  // Bumped on reset, to remount the chat rather than have it hold a
  // conversation about a document that no longer exists.
  const [conversation, setConversation] = useState(0);
  // A reply is in flight. Switching to the fields while one is on its way
  // would let the answer land on top of a value just typed by hand, and the
  // edit would vanish without a word.
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    setWorkspace(loadDraft());
    setDraftLoaded(true);
  }, []);

  useEffect(() => {
    if (draftLoaded) saveDraft(workspace);
  }, [workspace, draftLoaded]);

  const handleReset = () => {
    if (!window.confirm("Clear this document and start again?")) return;
    clearDraft();
    clearTranscript();
    setWorkspace(emptyWorkspace());
    setConversation((count) => count + 1);
    setMode("chat");
  };

  const document = findDocument(workspace.documentId);
  const showable = isRenderable(workspace);
  const outstanding = !showable
    ? []
    : isMutualNda(workspace)
      ? outstandingRequirements(workspace.values as MndaValues)
      : outstandingTerms(document!, workspace.values as TermValues);

  const title = workspace.documentId
    ? (DOCUMENT_NAMES[workspace.documentId] ?? "Document")
    : "Prelegal";

  return (
    <div className="layout">
      <header className="masthead">
        <div>
          <h1>{title}</h1>
          <p>
            {showable
              ? "Tell the assistant what you need and the agreement builds as you talk."
              : "Describe the agreement you need and the assistant will find the right one."}{" "}
            Based on the{" "}
            <a
              href="https://commonpaper.com"
              rel="noreferrer noopener"
              target="_blank"
            >
              Common Paper
            </a>{" "}
            standard agreements.
          </p>
        </div>
        <div className="masthead-actions">
          <button type="button" className="button-secondary" onClick={handleReset}>
            Start over
          </button>
          <button
            type="button"
            className="button-primary"
            disabled={!showable}
            onClick={() => window.print()}
          >
            Download PDF
          </button>
        </div>
      </header>

      <main className="panes">
        <section className="pane pane-form" aria-label="Agreement details">
          {showable && (
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
                disabled={replying}
                title={replying ? "Waiting for the assistant to reply" : undefined}
                onClick={() => setMode("fields")}
              >
                Edit fields
              </button>
            </div>
          )}

          {mode === "chat" || !showable ? (
            <ChatPanel
              key={conversation}
              workspace={workspace}
              onChange={setWorkspace}
              onBusyChange={setReplying}
              onDocumentChosen={(documentId) => {
                setWorkspace(startDocument(documentId));
                setMode("chat");
              }}
            />
          ) : isMutualNda(workspace) ? (
            <NdaForm
              values={workspace.values as MndaValues}
              onChange={(values) =>
                setWorkspace((previous) => ({ ...previous, values }))
              }
            />
          ) : (
            <TermsForm
              document={document!}
              values={workspace.values as TermValues}
              onChange={(values) =>
                setWorkspace((previous) => ({ ...previous, values }))
              }
            />
          )}
        </section>

        <section className="pane pane-preview" aria-label="Document preview">
          {!showable ? (
            <div className="preview-empty">
              <h2>Nothing to show yet</h2>
              <p>
                Once you and the assistant have settled on a document, it appears
                here and fills in as you talk. These are the ones available:
              </p>
              <ul>
                <li>Mutual Non-Disclosure Agreement</li>
                {GENERATED_DOCUMENTS.map((available) => (
                  <li key={available.id}>{available.name}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <div className="preview-status" role="status">
                {outstanding.length === 0 ? (
                  <p className="status-complete">
                    <span aria-hidden="true">✓</span> Ready to sign — all details
                    filled in.
                  </p>
                ) : (
                  <details>
                    <summary>
                      {outstanding.length} detail{outstanding.length === 1 ? "" : "s"}{" "}
                      still to fill in
                    </summary>
                    <ul>
                      {outstanding.map((label) => (
                        <li key={label}>{label}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>

              {isMutualNda(workspace) ? (
                <DocumentPreview values={workspace.values as MndaValues} />
              ) : (
                <TermsPreview
                  document={document!}
                  values={workspace.values as TermValues}
                />
              )}
            </>
          )}
        </section>
      </main>

      <footer className="colophon">
        <p>
          The Common Paper agreements are free to use and modify under{" "}
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

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
import { useEffect, useMemo, useState } from "react";
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
import { clearTranscript, saveTranscript, type ChatTurn } from "@/lib/chat";
import { clearDraft, loadDraft, saveDraft } from "@/lib/draft";
import { createDocument, fetchDocument, saveDocument } from "@/lib/api";
import { debounce } from "@/lib/debounce";
import {
  emptyWorkspace,
  isMutualNda,
  isRenderable,
  restoreDocument,
  startDocument,
  type Workspace,
} from "@/lib/workspace";

/** Chat fills the document in; the fields are there to correct it directly. */
type Mode = "chat" | "fields";

/** Long enough that typing a sentence is one save, short enough to feel saved. */
const SAVE_AFTER_MS = 800;

interface Props {
  /** A saved document to reopen, or null to carry on with the local draft. */
  openRecordId?: number | null;
  /** Called once that document is open, so it is not opened twice. */
  onOpened?: () => void;
}

export default function DocumentCreator({ openRecordId, onOpened }: Props = {}) {
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
    // A document was picked from the list: it, not the local draft, is what
    // should be on screen.
    if (openRecordId != null) return;

    setWorkspace(loadDraft());
    setDraftLoaded(true);
  }, [openRecordId]);

  useEffect(() => {
    if (openRecordId == null) return;

    let abandoned = false;

    fetchDocument(openRecordId)
      .then((saved) => {
        if (abandoned) return;

        const restored = restoreDocument(
          saved.id,
          saved.documentType,
          saved.values as Workspace["values"],
        );
        // Written to storage before the chat remounts, because that is where
        // ChatPanel reads its transcript from as it comes up.
        saveDraft(restored);
        saveTranscript(saved.transcript as ChatTurn[]);
        setWorkspace(restored);
        setConversation((count) => count + 1);
        setMode("chat");
        setDraftLoaded(true);
        onOpened?.();
      })
      .catch(() => {
        // Deleted, or belonging to someone else. Falling back to the local
        // draft is better than a screen with nothing on it.
        if (abandoned) return;
        setWorkspace(loadDraft());
        setDraftLoaded(true);
        onOpened?.();
      });

    return () => {
      abandoned = true;
    };
  }, [openRecordId, onOpened]);

  useEffect(() => {
    if (draftLoaded) saveDraft(workspace);
  }, [workspace, draftLoaded]);

  // One debounced saver for the life of the component, so successive edits
  // reset the same timer rather than each starting their own.
  const saveValues = useMemo(
    () =>
      debounce((recordId: number, values: Workspace["values"]) => {
        // Failures are swallowed exactly as the localStorage ones are: the
        // document on screen is unaffected and still downloadable, and there is
        // nothing the user could usefully do about it mid-sentence.
        void saveDocument(recordId, { values }).catch(() => {});
      }, SAVE_AFTER_MS),
    [],
  );

  // Flushed, not cancelled. Leaving for the documents list unmounts this
  // component, and that is exactly when an edit made a moment ago is still
  // waiting — cancelling would discard it, and reopening the document would
  // fetch the older version back from the server without a word.
  useEffect(() => saveValues.flush, [saveValues]);

  useEffect(() => {
    if (!draftLoaded || workspace.recordId === null) return;
    saveValues(workspace.recordId, workspace.values);
  }, [workspace.recordId, workspace.values, draftLoaded, saveValues]);

  useEffect(() => {
    // A document exists but has never been saved: give it a row to live in.
    //
    // No guard against a second call in flight, deliberately. This only runs
    // when the document, the record id or the loaded flag change, and none of
    // them changes while a request is out — so there is nothing to guard
    // against. A flag would also do harm: switching document mid-request is
    // exactly when a *new* row is wanted, and the flag would swallow it.
    if (!draftLoaded || workspace.documentId === null) return;
    if (workspace.recordId !== null) return;

    const documentId = workspace.documentId;

    createDocument(documentId)
      .then((created) => {
        setWorkspace((previous) =>
          // Only if they are still on the document this row was made for.
          // Switching in the meantime starts a different one, and the answers
          // now on screen are not the ones this row was created to hold.
          previous.documentId === documentId && previous.recordId === null
            ? { ...previous, recordId: created.id }
            : previous,
        );
      })
      .catch(() => {
        // Unsaved, but still perfectly usable: the document is in the browser
        // and prints from there. The next document chosen tries again.
      });
  }, [workspace.documentId, workspace.recordId, draftLoaded]);

  const handleReset = () => {
    if (!window.confirm("Start a new document? This one stays in your documents.")) {
      return;
    }
    // Only the local copy is cleared. The saved row is left exactly as it is —
    // starting over begins another document rather than discarding this one.
    clearDraft();
    clearTranscript();
    saveValues.cancel();
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
            New document
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

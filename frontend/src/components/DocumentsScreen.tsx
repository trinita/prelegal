"use client";

/**
 * Everything this account has drafted.
 *
 * The list is the signed-in landing screen rather than the editor, for two
 * reasons: it is what the ticket asks people to be able to look back at, and it
 * means a shared browser opens on "your documents" instead of on whatever the
 * last person left half-finished.
 */
import { useCallback, useEffect, useState } from "react";
import { ApiError, listDocuments, type DocumentSummary } from "@/lib/api";

interface Props {
  onOpen: (id: number) => void;
  onStartNew: () => void;
}

type Status = "loading" | "ready" | "failed";

/** "2 March 2026, 14:05" — unambiguous, and not a relative time that goes stale. */
function formatWhen(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "";

  return when.toLocaleString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DocumentsScreen({ onOpen, onStartNew }: Props) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setStatus("loading");
    listDocuments()
      .then((found) => {
        setDocuments(found);
        setStatus("ready");
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Could not load your documents.",
        );
        setStatus("failed");
      });
  }, []);

  useEffect(load, [load]);

  return (
    <div className="layout">
      <header className="masthead">
        <div>
          <h1>Your documents</h1>
          <p>
            Everything you have drafted, most recently worked on first. Open one
            to carry on where you left off — the conversation comes back with it.
          </p>
        </div>
        <div className="masthead-actions">
          <button type="button" className="button-primary" onClick={onStartNew}>
            New document
          </button>
        </div>
      </header>

      <main className="pane documents">
        {status === "loading" && (
          <p className="documents-status" role="status">
            Loading your documents…
          </p>
        )}

        {status === "failed" && (
          <div className="chat-error" role="alert">
            <p>{error}</p>
            <button type="button" className="button-secondary" onClick={load}>
              Try again
            </button>
          </div>
        )}

        {status === "ready" && documents.length === 0 && (
          <div className="preview-empty">
            <h2>Nothing here yet</h2>
            <p>
              Start a document and it appears here as soon as you and the
              assistant have settled on what you need.
            </p>
            <button type="button" className="button-primary" onClick={onStartNew}>
              Draft your first agreement
            </button>
          </div>
        )}

        {status === "ready" && documents.length > 0 && (
          <ul className="document-cards">
            {documents.map((document) => (
              <li key={document.id}>
                <button
                  type="button"
                  className="document-card"
                  onClick={() => onOpen(document.id)}
                >
                  <span className="document-card-title">{document.title}</span>
                  <span className="document-card-when">
                    Updated {formatWhen(document.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <footer className="colophon">
        <p>
          Saved documents live only as long as the server does — they are
          cleared whenever it restarts. Download anything you need to keep.
        </p>
      </footer>
    </div>
  );
}

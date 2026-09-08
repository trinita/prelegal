"use client";

/**
 * The conversation that fills in the document.
 *
 * The assistant's answer arrives as one object holding both the reply and the
 * document's updated values, so the transcript and the preview move together -
 * there is no moment where the chat says a date was recorded and the document
 * disagrees.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import {
  GREETING,
  loadTranscript,
  saveTranscript,
  sendChatMessage,
  type ChatTurn,
} from "@/lib/chat";
import type { Workspace } from "@/lib/workspace";

interface Props {
  workspace: Workspace;
  /**
   * Takes an updater rather than a value, so a reply can never write over
   * state that changed while it was in flight.
   */
  onChange: (update: (previous: Workspace) => Workspace) => void;
  /**
   * The assistant has settled on a document, or the user has changed to a
   * different one. The creator starts that document fresh: one agreement's
   * answers are not another's.
   */
  onDocumentChosen: (documentId: string) => void;
  /** Whether a reply is in flight, so the rest of the UI can hold still. */
  onBusyChange?: (busy: boolean) => void;
}

export default function ChatPanel({
  workspace,
  onChange,
  onDocumentChosen,
  onBusyChange,
}: Props) {
  const [turns, setTurns] = useState<ChatTurn[]>([GREETING]);
  // Read after mount so the server and first client render agree, exactly as
  // the saved draft is.
  const [restored, setRestored] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const foot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTurns(loadTranscript());
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) saveTranscript(turns);
  }, [turns, restored]);

  useEffect(() => {
    foot.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, pending]);

  useEffect(() => {
    onBusyChange?.(pending);
  }, [pending, onBusyChange]);

  const exchange = useCallback(
    async (history: ChatTurn[]) => {
      setPending(true);
      setError(null);

      try {
        const answer = await sendChatMessage(history, workspace);
        setTurns([...history, { role: "assistant", content: answer.reply }]);

        if (answer.documentId !== workspace.documentId) {
          // A document was chosen or changed. The server has already discarded
          // the previous answers; the creator starts the new one fresh.
          if (answer.documentId !== null) onDocumentChosen(answer.documentId);
          return;
        }

        // Written against the latest state, not the state this request was
        // sent with, and only if the document has not moved on in between.
        onChange((previous) =>
          previous.documentId === answer.documentId
            ? { ...previous, values: answer.values }
            : previous,
        );
      } catch (caught) {
        // Nothing is rolled back: the user's message is already in the
        // transcript, so Try again resends it, and everything extracted so far
        // is untouched - the document they have is still theirs to download.
        setError(
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Please try again.",
        );
      } finally {
        setPending(false);
        inputRef.current?.focus();
      }
    },
    [workspace, onChange, onDocumentChosen],
  );

  const send = () => {
    const text = draft.trim();
    if (text === "" || pending) return;

    // Committed to state before the request, not after it. Otherwise the
    // message is invisible while it is in flight, and a failed send loses it
    // outright - including from Try again, which resends whatever `turns`
    // holds.
    const history: ChatTurn[] = [...turns, { role: "user", content: text }];
    setDraft("");
    setTurns(history);
    void exchange(history);
  };

  return (
    <div className="chat">
      <div className="chat-log" role="log" aria-live="polite" aria-label="Conversation">
        {turns.map((turn, index) => (
          <p key={index} className={`bubble bubble-${turn.role}`}>
            {turn.content}
          </p>
        ))}

        {pending && (
          <p className="bubble bubble-assistant chat-thinking">
            <span className="visually-hidden">The assistant is replying</span>
            <span aria-hidden="true">● ● ●</span>
          </p>
        )}

        {error && (
          <div className="chat-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void exchange(turns)}
            >
              Try again
            </button>
            <p className="chat-error-note">
              Everything recorded so far is safe, and the document is still
              yours to download.
            </p>
          </div>
        )}

        <div ref={foot} />
      </div>

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label className="visually-hidden" htmlFor="chat-input">
          Your message
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          rows={2}
          value={draft}
          placeholder="Tell me about the agreement…"
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter is a new line, as every chat box works.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
        />
        <button
          type="submit"
          className="button-submit"
          disabled={pending || draft.trim() === ""}
        >
          Send
        </button>
      </form>
    </div>
  );
}

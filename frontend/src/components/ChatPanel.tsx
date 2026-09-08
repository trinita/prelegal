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
import type { MndaValues } from "@/lib/fields";

interface Props {
  values: MndaValues;
  onChange: (values: MndaValues) => void;
}

export default function ChatPanel({ values, onChange }: Props) {
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

  const exchange = useCallback(
    async (history: ChatTurn[]) => {
      setPending(true);
      setError(null);

      try {
        const answer = await sendChatMessage(history, values);
        setTurns([...history, { role: "assistant", content: answer.reply }]);
        onChange(answer.values);
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
    [values, onChange],
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

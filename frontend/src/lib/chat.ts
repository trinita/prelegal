/**
 * The conversation with the assistant.
 *
 * The transcript lives in the browser and is replayed to the server on each
 * turn. Nothing is stored server-side: the database is rebuilt on every start,
 * so keeping conversations there would promise a durability that does not
 * exist.
 */
import { apiFetch } from "@/lib/api";
import { readJson, remove, writeJson } from "@/lib/storage";
import type { MndaValues } from "@/lib/fields";

const STORAGE_KEY = "prelegal.mnda.transcript.v1";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ChatReply {
  reply: string;
  values: MndaValues;
  /** Field names still outstanding, as the server sees them. */
  outstanding: string[];
}

export const GREETING: ChatTurn = {
  role: "assistant",
  content:
    "Hello — I can put together a mutual NDA with you. Tell me what you need it " +
    "for, or just start with who the two sides are, and I'll ask about the rest " +
    "as we go.",
};

export function sendChatMessage(messages: ChatTurn[], values: MndaValues) {
  return apiFetch<ChatReply>("/api/chat/message", {
    method: "POST",
    body: JSON.stringify({ messages, values }),
  });
}

export function loadTranscript(): ChatTurn[] {
  const stored = readJson<ChatTurn[]>(STORAGE_KEY);
  if (!Array.isArray(stored) || stored.length === 0) return [GREETING];

  // A transcript written by an older version could hold anything; keep only
  // what still reads as a turn rather than rendering undefined into the page.
  const turns = stored.filter(
    (turn): turn is ChatTurn =>
      typeof turn?.content === "string" &&
      (turn.role === "user" || turn.role === "assistant"),
  );

  return turns.length > 0 ? turns : [GREETING];
}

export const saveTranscript = (turns: ChatTurn[]) => writeJson(STORAGE_KEY, turns);

export const clearTranscript = () => remove(STORAGE_KEY);

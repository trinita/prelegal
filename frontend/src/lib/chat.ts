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
import type { Workspace } from "@/lib/workspace";

const STORAGE_KEY = "prelegal.mnda.transcript.v1";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatReply {
  reply: string;
  /**
   * The document after this turn. It differs from the one sent when the user
   * has just settled on something, or changed their mind — and stays null
   * while they are still deciding, or have asked for something this product
   * cannot produce.
   */
  documentId: string | null;
  /** The whole document, merged on the server, in the shape that document uses. */
  values: Workspace["values"];
  /** Field names still outstanding, as the server sees them. */
  outstanding: string[];
}

export const GREETING: ChatTurn = {
  role: "assistant",
  content:
    "Hello — I can draft an agreement with you. Tell me what you need: an NDA, " +
    "a SaaS subscription, a pilot, a consulting arrangement, and a few others. " +
    "Describe it in your own words and I'll work out which one fits.",
};

export function sendChatMessage(messages: ChatTurn[], workspace: Workspace) {
  return apiFetch<ChatReply>("/api/chat/message", {
    method: "POST",
    body: JSON.stringify({
      messages,
      documentId: workspace.documentId,
      values: workspace.values,
    }),
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

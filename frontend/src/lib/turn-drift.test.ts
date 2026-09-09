/**
 * `SavedTurn` and `ChatTurn` describe the same thing in two places.
 *
 * `lib/chat.ts` already imports `apiFetch` from `lib/api.ts`, so `api.ts`
 * cannot import `ChatTurn` back without closing a cycle — it declares its own
 * `SavedTurn` instead. That is a duplicated shape, and duplicated shapes drift:
 * `DocumentCreator` casts one to the other with `as`, which would go on
 * compiling long after they stopped meaning the same thing.
 *
 * So the check the comment in `api.ts` points at lives here, in the spirit of
 * `schema-drift.test.ts` — the two are held to each other in both directions
 * rather than trusted to stay in step.
 */
import { describe, expect, it } from "vitest";
import type { SavedTurn } from "./api";
import { GREETING, type ChatTurn } from "./chat";

/** Fails to compile if either type gains a field the other lacks. */
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

describe("a saved turn and a chat turn", () => {
  it("are the same type in both directions", () => {
    const bothWays: Exact<SavedTurn, ChatTurn> = true;

    expect(bothWays).toBe(true);
  });

  it("accept each other's values", () => {
    const saved: SavedTurn = { role: "user", content: "An NDA, please." };
    const asTurn: ChatTurn = saved;
    const backAgain: SavedTurn = asTurn;

    expect(backAgain).toEqual(saved);
  });

  it("describe the transcript the chat actually produces", () => {
    /** The greeting is a real turn, so it must satisfy the saved shape too. */
    const stored: SavedTurn = GREETING;

    expect(stored.role).toBe("assistant");
  });
});

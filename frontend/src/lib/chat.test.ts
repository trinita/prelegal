import { afterEach, describe, expect, it, vi } from "vitest";
import { GREETING, loadTranscript, saveTranscript, sendChatMessage } from "./chat";

const STORAGE_KEY = "prelegal.mnda.transcript.v1";

/** A localStorage good enough to round-trip, as jsdom is not set up here. */
function stubStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendChatMessage", () => {
  it("posts the transcript and the document's values together", async () => {
    stubStorage();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ reply: "Noted.", values: {}, outstanding: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await sendChatMessage(
      [{ role: "user", content: "Delaware law" }],
      { governingLaw: "" } as never,
    );

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/chat/message");
    // The server needs both to answer: the conversation for context, and the
    // current values so it can say what is still missing.
    expect(JSON.parse(init.body as string)).toEqual({
      messages: [{ role: "user", content: "Delaware law" }],
      values: { governingLaw: "" },
    });
  });
});

describe("loadTranscript", () => {
  it("opens with the greeting when there is nothing stored", () => {
    stubStorage();

    expect(loadTranscript()).toEqual([GREETING]);
  });

  it("restores a saved conversation", () => {
    stubStorage();
    const turns = [GREETING, { role: "user" as const, content: "Delaware" }];
    saveTranscript(turns);

    expect(loadTranscript()).toEqual(turns);
  });

  it("drops turns it cannot render rather than showing undefined", () => {
    // What a transcript written by an older version of the app could hold.
    stubStorage({
      [STORAGE_KEY]: JSON.stringify([
        { role: "user", content: "real" },
        { role: "user" },
        { speaker: "assistant", text: "old shape" },
        { role: "system", content: "not ours" },
      ]),
    });

    expect(loadTranscript()).toEqual([{ role: "user", content: "real" }]);
  });

  it("falls back to the greeting when nothing survives the filter", () => {
    stubStorage({ [STORAGE_KEY]: JSON.stringify([{ speaker: "nobody" }]) });

    expect(loadTranscript()).toEqual([GREETING]);
  });

  it("survives storage holding something that is not a list", () => {
    stubStorage({ [STORAGE_KEY]: JSON.stringify({ turns: [] }) });

    expect(loadTranscript()).toEqual([GREETING]);
  });

  it("survives unreadable storage", () => {
    stubStorage({ [STORAGE_KEY]: "{ not json" });

    expect(loadTranscript()).toEqual([GREETING]);
  });
});

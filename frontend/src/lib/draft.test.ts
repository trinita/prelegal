import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDraft, loadDraft, saveDraft } from "./draft";
import { defaultValues } from "./fields";

const KEY = "prelegal.mnda.draft.v1";

/** A minimal localStorage, so the browser-only paths can be exercised. */
function useStorage(overrides: Partial<Storage> = {}) {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    ...overrides,
  };
  vi.stubGlobal("window", { localStorage: storage });
  return { store, storage };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("without a browser", () => {
  it("falls back to defaults when there is no window", () => {
    expect(loadDraft()).toEqual(defaultValues());
  });
});

describe("round trip", () => {
  it("restores what was saved", () => {
    useStorage();
    const values = { ...defaultValues(), governingLaw: "Delaware" };

    saveDraft(values);

    expect(loadDraft()).toEqual(values);
  });

  it("returns defaults when nothing has been saved", () => {
    useStorage();
    expect(loadDraft()).toEqual(defaultValues());
  });

  it("forgets the draft when cleared", () => {
    const { store } = useStorage();
    saveDraft({ ...defaultValues(), jurisdiction: "New Castle, DE" });

    clearDraft();

    expect(store.has(KEY)).toBe(false);
    expect(loadDraft()).toEqual(defaultValues());
  });
});

describe("drafts saved by an older version", () => {
  it("fills in fields the stored draft does not have", () => {
    const { store } = useStorage();
    store.set(KEY, JSON.stringify({ governingLaw: "Delaware" }));

    const loaded = loadDraft();

    expect(loaded.governingLaw).toBe("Delaware");
    // Everything absent from the draft comes from the defaults.
    expect(loaded.purpose).toBe(defaultValues().purpose);
    expect(loaded.partyOne).toEqual(defaultValues().partyOne);
  });

  it("merges a partially stored party rather than replacing it", () => {
    const { store } = useStorage();
    store.set(KEY, JSON.stringify({ partyOne: { company: "Acme" } }));

    const loaded = loadDraft();

    expect(loaded.partyOne.company).toBe("Acme");
    expect(loaded.partyOne.printName).toBe("");
  });
});

describe("when storage misbehaves", () => {
  it("falls back to defaults if the stored draft is not valid JSON", () => {
    const { store } = useStorage();
    store.set(KEY, "{ not json");

    expect(loadDraft()).toEqual(defaultValues());
  });

  it("falls back to defaults if reading throws", () => {
    useStorage({
      getItem: () => {
        throw new Error("site data blocked");
      },
    });

    expect(loadDraft()).toEqual(defaultValues());
  });

  it("does not throw if saving fails, so the form keeps working", () => {
    useStorage({
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });

    expect(() => saveDraft(defaultValues())).not.toThrow();
  });

  it("does not throw if clearing fails", () => {
    useStorage({
      removeItem: () => {
        throw new Error("unavailable");
      },
    });

    expect(() => clearDraft()).not.toThrow();
  });
});

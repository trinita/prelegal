import { afterEach, describe, expect, it, vi } from "vitest";
import { clearDraft, loadDraft, saveDraft } from "./draft";
import { defaultValues, type MndaValues } from "./fields";
import { emptyWorkspace, startDocument } from "./workspace";
import { MUTUAL_NDA_ID } from "./documents";

const KEY = "prelegal.draft.v2";
const LEGACY_KEY = "prelegal.mnda.draft.v1";

/** A Mutual NDA workspace, which is what most of these tests are about. */
const mnda = (overrides: Record<string, unknown> = {}) => ({
  documentId: MUTUAL_NDA_ID,
  values: { ...defaultValues(), ...overrides },
});

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
  it("falls back to an empty workspace when there is no window", () => {
    expect(loadDraft()).toEqual(emptyWorkspace());
  });
});

describe("round trip", () => {
  it("restores what was saved", () => {
    useStorage();
    const workspace = mnda({ governingLaw: "Delaware" });

    saveDraft(workspace);

    expect(loadDraft()).toEqual(workspace);
  });

  it("restores a document that is not the Mutual NDA", () => {
    useStorage();
    const workspace = { documentId: "pilot-agreement", values: { provider: "Acme" } };

    saveDraft(workspace);

    expect(loadDraft()).toEqual(workspace);
  });

  it("returns an empty workspace when nothing has been saved", () => {
    useStorage();
    expect(loadDraft()).toEqual(emptyWorkspace());
  });

  it("forgets the draft when cleared", () => {
    const { store } = useStorage();
    saveDraft(mnda({ jurisdiction: "New Castle, DE" }));

    clearDraft();

    expect(store.has(KEY)).toBe(false);
    expect(loadDraft()).toEqual(emptyWorkspace());
  });

  it("does not carry one document's answers into another", () => {
    useStorage();
    saveDraft(startDocument("pilot-agreement"));

    expect(loadDraft().values).toEqual({});
  });
});

describe("drafts saved by an older version", () => {
  it("reads a draft from before there was more than one document", () => {
    // v1 stored the Mutual NDA's values bare, with no document id.
    const { store } = useStorage();
    store.set(LEGACY_KEY, JSON.stringify({ governingLaw: "Delaware" }));

    const loaded = loadDraft();

    expect(loaded.documentId).toBe(MUTUAL_NDA_ID);
    expect((loaded.values as Record<string, string>).governingLaw).toBe("Delaware");
  });

  it("fills in fields the stored draft does not have", () => {
    const { store } = useStorage();
    store.set(KEY, JSON.stringify(mnda({ governingLaw: "Delaware" })));

    const values = loadDraft().values as MndaValues;

    expect(values.governingLaw).toBe("Delaware");
    // Everything absent from the draft comes from the defaults.
    expect(values.purpose).toBe(defaultValues().purpose);
    expect(values.partyOne).toEqual(defaultValues().partyOne);
  });

  it("merges a partially stored party rather than replacing it", () => {
    const { store } = useStorage();
    store.set(
      KEY,
      JSON.stringify({ documentId: MUTUAL_NDA_ID, values: { partyOne: { company: "Acme" } } }),
    );

    const values = loadDraft().values as MndaValues;

    expect(values.partyOne.company).toBe("Acme");
    expect(values.partyOne.printName).toBe("");
  });
});

describe("when storage misbehaves", () => {
  it("falls back to an empty workspace if the stored draft is not valid JSON", () => {
    const { store } = useStorage();
    store.set(KEY, "{ not json");

    expect(loadDraft()).toEqual(emptyWorkspace());
  });

  it("falls back to an empty workspace if reading throws", () => {
    useStorage({
      getItem: () => {
        throw new Error("site data blocked");
      },
    });

    expect(loadDraft()).toEqual(emptyWorkspace());
  });

  it("does not throw if saving fails, so the form keeps working", () => {
    useStorage({
      setItem: () => {
        throw new Error("quota exceeded");
      },
    });

    expect(() => saveDraft(mnda())).not.toThrow();
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

/**
 * Keeps an in-progress agreement in the browser so a refresh does not discard a
 * half-filled document.
 *
 * Since PL-10 this is a cache rather than the only copy: a document with a
 * `recordId` is also saved to the account that owns it, and the server is what
 * "my documents" reads. What this still does, and the server cannot, is survive
 * the moment between a keystroke and the debounced save that follows it.
 *
 * Storage can be unavailable (private windows, blocked site data), so every
 * access tolerates failure and the app falls back to an empty workspace.
 * `clearDraft` is called on every change of who is signed in, so one person's
 * half-typed agreement is never waiting for the next.
 */
import { defaultValues, type MndaValues } from "./fields";
import { readJson, remove, writeJson } from "./storage";
import { emptyWorkspace, type Workspace } from "./workspace";
import { MUTUAL_NDA_ID } from "./documents";

// v2: a draft records which document is being drafted, not just the Mutual
// NDA's values. A v1 draft is a bare MndaValues object and is read as one.
// The key did not need bumping for PL-10's `recordId`: a v2 draft without one
// reads as null, which is exactly what it means — never saved to an account.
const STORAGE_KEY = "prelegal.draft.v2";
const LEGACY_KEY = "prelegal.mnda.draft.v1";

/** Fills in anything a stored MNDA draft is missing, so an older one still loads. */
function completeMnda(stored: Partial<MndaValues>): MndaValues {
  const base = defaultValues();
  return {
    ...base,
    ...stored,
    partyOne: { ...base.partyOne, ...stored.partyOne },
    partyTwo: { ...base.partyTwo, ...stored.partyTwo },
  };
}

export function loadDraft(): Workspace {
  const stored = readJson<Partial<Workspace>>(STORAGE_KEY);

  if (stored !== null && typeof stored === "object" && "documentId" in stored) {
    const documentId = typeof stored.documentId === "string" ? stored.documentId : null;
    const values =
      stored.values !== null && typeof stored.values === "object" ? stored.values : {};

    return {
      documentId,
      recordId: typeof stored.recordId === "number" ? stored.recordId : null,
      values:
        documentId === MUTUAL_NDA_ID
          ? completeMnda(values as Partial<MndaValues>)
          : (values as Workspace["values"]),
    };
  }

  // A draft saved before there was more than one document is a Mutual NDA.
  const legacy = readJson<Partial<MndaValues>>(LEGACY_KEY);
  if (legacy !== null && typeof legacy === "object") {
    return {
      documentId: MUTUAL_NDA_ID,
      recordId: null,
      values: completeMnda(legacy),
    };
  }

  return emptyWorkspace();
}

export const saveDraft = (workspace: Workspace) => writeJson(STORAGE_KEY, workspace);

export const clearDraft = () => {
  remove(STORAGE_KEY);
  remove(LEGACY_KEY);
};

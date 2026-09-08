/**
 * Keeps an in-progress agreement in the browser so a refresh does not discard a
 * half-filled document.
 *
 * Drafts hold party names and addresses, so they stay on the user's machine:
 * nothing here is sent anywhere. Storage can also be unavailable (private
 * windows, blocked site data), so every access tolerates failure and the app
 * simply falls back to an empty workspace.
 */
import { defaultValues, type MndaValues } from "./fields";
import { readJson, remove, writeJson } from "./storage";
import { emptyWorkspace, type Workspace } from "./workspace";
import { MUTUAL_NDA_ID } from "./documents";

// v2: a draft now records which document is being drafted, not just the Mutual
// NDA's values. A v1 draft is a bare MndaValues object and is read as one.
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
      values:
        documentId === MUTUAL_NDA_ID
          ? completeMnda(values as Partial<MndaValues>)
          : (values as Workspace["values"]),
    };
  }

  // A draft saved before there was more than one document is a Mutual NDA.
  const legacy = readJson<Partial<MndaValues>>(LEGACY_KEY);
  if (legacy !== null && typeof legacy === "object") {
    return { documentId: MUTUAL_NDA_ID, values: completeMnda(legacy) };
  }

  return emptyWorkspace();
}

export const saveDraft = (workspace: Workspace) => writeJson(STORAGE_KEY, workspace);

export const clearDraft = () => {
  remove(STORAGE_KEY);
  remove(LEGACY_KEY);
};

/**
 * Keeps an in-progress agreement in the browser so a refresh does not discard a
 * half-filled form.
 *
 * Drafts hold party names and addresses, so they stay on the user's machine:
 * nothing here is sent anywhere. Storage can also be unavailable (private
 * windows, blocked site data), so every access tolerates failure and the app
 * simply falls back to an empty form.
 */
import { defaultValues, type MndaValues } from "./fields";
import { readJson, remove, writeJson } from "./storage";

const STORAGE_KEY = "prelegal.mnda.draft.v1";

export function loadDraft(): MndaValues {
  const parsed = readJson<Partial<MndaValues>>(STORAGE_KEY);
  const base = defaultValues();
  if (parsed === null || typeof parsed !== "object") return base;

  // Merge onto the defaults so a draft saved by an older version of the form
  // - or one missing fields - still loads.
  return {
    ...base,
    ...parsed,
    partyOne: { ...base.partyOne, ...parsed.partyOne },
    partyTwo: { ...base.partyTwo, ...parsed.partyTwo },
  };
}

export const saveDraft = (values: MndaValues) => writeJson(STORAGE_KEY, values);

export const clearDraft = () => remove(STORAGE_KEY);

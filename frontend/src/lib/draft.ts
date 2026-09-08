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

const STORAGE_KEY = "prelegal.mnda.draft.v1";

export function loadDraft(): MndaValues {
  if (typeof window === "undefined") return defaultValues();

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultValues();
    const parsed = JSON.parse(stored) as Partial<MndaValues>;
    const base = defaultValues();
    // Merge onto the defaults so a draft saved by an older version of the form
    // - or one missing fields - still loads.
    return {
      ...base,
      ...parsed,
      partyOne: { ...base.partyOne, ...parsed.partyOne },
      partyTwo: { ...base.partyTwo, ...parsed.partyTwo },
    };
  } catch {
    return defaultValues();
  }
}

export function saveDraft(values: MndaValues): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Storage unavailable or full; the form still works for this session.
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: the draft was never persisted.
  }
}

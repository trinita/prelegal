/**
 * localStorage, for code that must not care whether it works.
 *
 * Storage can be blocked (private windows, blocked site data) or full, and the
 * app has to keep working either way: what is kept here is a convenience, never
 * the document itself.
 */

export function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(key);
    return stored === null ? null : (JSON.parse(stored) as T);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Unavailable or full; this session carries on without it.
  }
}

export function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Nothing to do: it was never persisted.
  }
}

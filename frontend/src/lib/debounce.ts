/**
 * Waits for a pause before acting.
 *
 * The form calls `onChange` on every keystroke, and each one would otherwise be
 * a request. The local draft is still written immediately — that is what
 * protects a half-typed value from a refresh — and only the trip to the server
 * waits for the typing to stop.
 */

export interface Debounced<A extends unknown[]> {
  (...args: A): void;
  /**
   * Acts now, with whatever is pending. This is what a component going away
   * wants: cancelling instead would discard the user's last edit, which is the
   * one thing the save exists to prevent.
   */
  flush: () => void;
  /** Abandons a pending call without running it. */
  cancel: () => void;
}

export function debounce<A extends unknown[]>(
  action: (...args: A) => void,
  delayMs: number,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: A | null = null;

  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  const debounced = (...args: A) => {
    if (timer !== null) clearTimeout(timer);
    pending = args;
    timer = setTimeout(() => {
      const args_ = pending;
      clear();
      if (args_ !== null) action(...args_);
    }, delayMs);
  };

  debounced.flush = () => {
    const args = pending;
    clear();
    if (args !== null) action(...args);
  };

  debounced.cancel = clear;

  return debounced;
}

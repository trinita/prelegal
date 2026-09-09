import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./debounce";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("debounce", () => {
  it("does not act until the delay has passed", () => {
    const action = vi.fn();

    debounce(action, 800)();

    expect(action).not.toHaveBeenCalled();
    vi.advanceTimersByTime(800);
    expect(action).toHaveBeenCalledOnce();
  });

  it("collapses a burst of calls into one", () => {
    /** A typed sentence is one save, not one per keystroke. */
    const action = vi.fn();
    const debounced = debounce(action, 800);

    for (const letter of "Delaware") debounced(letter);
    vi.advanceTimersByTime(800);

    expect(action).toHaveBeenCalledOnce();
    expect(action).toHaveBeenCalledWith("e");
  });

  it("restarts the wait when called again", () => {
    const action = vi.fn();
    const debounced = debounce(action, 800);

    debounced();
    vi.advanceTimersByTime(700);
    debounced();
    vi.advanceTimersByTime(700);

    expect(action).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(action).toHaveBeenCalledOnce();
  });

  it("abandons a pending call when cancelled", () => {
    /** What a component unmounting needs, so a save cannot outlive it. */
    const action = vi.fn();
    const debounced = debounce(action, 800);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(5000);

    expect(action).not.toHaveBeenCalled();
  });

  it("acts immediately when flushed, so a pending call is not lost", () => {
    /**
     * What a component unmounting needs. Cancelling instead would throw away
     * the user's last edit — the very thing the save exists to keep.
     */
    const action = vi.fn();
    const debounced = debounce(action, 800);

    debounced("Delaware");
    debounced.flush();

    expect(action).toHaveBeenCalledWith("Delaware");
  });

  it("does not act twice when flushed and then left to fire", () => {
    const action = vi.fn();
    const debounced = debounce(action, 800);

    debounced("Delaware");
    debounced.flush();
    vi.advanceTimersByTime(5000);

    expect(action).toHaveBeenCalledOnce();
  });

  it("does nothing when flushed with nothing pending", () => {
    const action = vi.fn();
    const debounced = debounce(action, 800);

    debounced.flush();

    expect(action).not.toHaveBeenCalled();
  });

  it("is usable again after being cancelled", () => {
    const action = vi.fn();
    const debounced = debounce(action, 800);

    debounced();
    debounced.cancel();
    debounced();
    vi.advanceTimersByTime(800);

    expect(action).toHaveBeenCalledOnce();
  });
});

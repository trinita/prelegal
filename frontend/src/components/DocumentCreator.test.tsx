// @vitest-environment jsdom
/**
 * Saving a document, and opening a saved one.
 *
 * This is the behaviour PL-10 adds that has nowhere else to be checked: the
 * chat and the form both change the same workspace, and both have to reach the
 * server without either one sending a request per keystroke.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import DocumentCreator from "./DocumentCreator";
import * as api from "@/lib/api";
import * as chat from "@/lib/chat";
import { clearDraft, saveDraft } from "@/lib/draft";
import { MUTUAL_NDA_ID } from "@/lib/documents";
import { defaultValues } from "@/lib/fields";

const detail = (over: Partial<api.DocumentDetail> = {}): api.DocumentDetail => ({
  id: 7,
  documentType: MUTUAL_NDA_ID,
  title: "Mutual Non-Disclosure Agreement",
  createdAt: "2026-03-01T10:00:00Z",
  updatedAt: "2026-03-01T10:00:00Z",
  values: {},
  transcript: [],
  ...over,
});

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  clearDraft();
  chat.clearTranscript();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearDraft();
  chat.clearTranscript();
});

describe("saving a document", () => {
  it("creates a row once the document is known", async () => {
    const create = vi.spyOn(api, "createDocument").mockResolvedValue(detail());
    vi.spyOn(api, "saveDocument").mockResolvedValue(detail());
    saveDraft({ documentId: MUTUAL_NDA_ID, recordId: null, values: defaultValues() });

    render(<DocumentCreator />);

    await waitFor(() => expect(create).toHaveBeenCalledWith(MUTUAL_NDA_ID));
  });

  it("does not create a row while the document is still unsettled", async () => {
    /** Nothing has been chosen yet; there is no document to save. */
    const create = vi.spyOn(api, "createDocument").mockResolvedValue(detail());

    render(<DocumentCreator />);
    await screen.findByText("Nothing to show yet");

    expect(create).not.toHaveBeenCalled();
  });

  it("creates only one row for one document", async () => {
    /**
     * Rendered in StrictMode, which is what `next.config.ts` turns on and which
     * runs every effect twice on mount — the way a duplicate row would most
     * plausibly appear.
     */
    const create = vi.spyOn(api, "createDocument").mockResolvedValue(detail());
    vi.spyOn(api, "saveDocument").mockResolvedValue(detail());
    saveDraft({ documentId: MUTUAL_NDA_ID, recordId: null, values: defaultValues() });

    render(
      <StrictMode>
        <DocumentCreator />
      </StrictMode>,
    );
    await waitFor(() => expect(create).toHaveBeenCalled());
    await act(async () => {
      await Promise.resolve();
    });

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("saves the answers once the typing stops, not once per keystroke", async () => {
    /**
     * The form calls onChange on every character. The local draft is written
     * immediately, because that is what survives a refresh; only the request
     * waits for a pause.
     */
    vi.useFakeTimers();
    try {
      const save = vi.spyOn(api, "saveDocument").mockResolvedValue(detail());
      vi.spyOn(api, "createDocument").mockResolvedValue(detail());
      saveDraft({
        documentId: MUTUAL_NDA_ID,
        recordId: 7,
        values: { ...defaultValues(), jurisdiction: "" },
      });

      render(<DocumentCreator />);
      await act(async () => {
        await Promise.resolve();
      });
      save.mockClear();

      const fields = screen.getByRole("tab", { name: "Edit fields" });
      await act(async () => {
        fields.click();
      });

      const input = screen.getByLabelText(/Jurisdiction/i) as HTMLInputElement;
      for (const value of ["D", "De", "Del"]) {
        await act(async () => {
          fireEvent.change(input, { target: { value } });
        });
      }

      // Only the values matter here. Leaving the chat tab flushes its
      // transcript, which is a different save with its own reason to happen.
      const valueSaves = () =>
        save.mock.calls.filter(([, patch]) => "values" in patch).length;

      expect(valueSaves()).toBe(0);

      await act(async () => {
        vi.advanceTimersByTime(800);
      });

      expect(valueSaves()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves an edit made just before leaving the screen", async () => {
    /**
     * Clicking "Your documents" within the debounce window unmounts this
     * component. Cancelling the pending save there would drop the edit
     * silently, and reopening the document would fetch the older version from
     * the server — the change gone, with nothing said.
     */
    vi.useFakeTimers();
    try {
      const save = vi.spyOn(api, "saveDocument").mockResolvedValue(detail());
      vi.spyOn(api, "createDocument").mockResolvedValue(detail());
      saveDraft({
        documentId: MUTUAL_NDA_ID,
        recordId: 7,
        values: { ...defaultValues(), jurisdiction: "" },
      });

      const view = render(<DocumentCreator />);
      await act(async () => {
        await Promise.resolve();
      });
      save.mockClear();

      await act(async () => {
        screen.getByRole("tab", { name: "Edit fields" }).click();
      });
      await act(async () => {
        fireEvent.change(screen.getByLabelText(/Jurisdiction/i), {
          target: { value: "New Castle, Delaware" },
        });
      });

      // Away before the timer fires.
      await act(async () => {
        view.unmount();
      });

      expect(save).toHaveBeenCalledWith(7, {
        values: expect.objectContaining({ jurisdiction: "New Castle, Delaware" }),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts a new document without deleting the one before it", async () => {
    /** "New document" begins another; it does not discard what was saved. */
    vi.spyOn(api, "createDocument").mockResolvedValue(detail());
    vi.spyOn(api, "saveDocument").mockResolvedValue(detail());
    saveDraft({ documentId: MUTUAL_NDA_ID, recordId: 7, values: defaultValues() });
    vi.stubGlobal("confirm", () => true);

    render(<DocumentCreator />);
    await screen.findByRole("region", { name: "Document preview" });
    await act(async () => {
      screen.getByRole("button", { name: "New document" }).click();
    });

    // Nothing asks the server to remove the old row; there is no such call.
    expect(api).not.toHaveProperty("deleteDocument");
    expect(await screen.findByText("Nothing to show yet")).toBeTruthy();
  });

  it("keeps working when the document cannot be saved", async () => {
    /**
     * The agreement is in the browser and prints from there. A server that
     * cannot be reached must not take the document off the screen.
     */
    vi.spyOn(api, "createDocument").mockRejectedValue(new api.ApiError(0, "offline"));
    saveDraft({ documentId: MUTUAL_NDA_ID, recordId: null, values: defaultValues() });

    render(<DocumentCreator />);

    expect(
      await screen.findByRole("region", { name: "Document preview" }),
    ).toBeTruthy();
  });
});

describe("opening a saved document", () => {
  it("restores the values it was saved with", async () => {
    vi.spyOn(api, "fetchDocument").mockResolvedValue(
      detail({ values: { ...defaultValues(), jurisdiction: "New Castle, Delaware" } }),
    );
    vi.spyOn(api, "saveDocument").mockResolvedValue(detail());

    render(<DocumentCreator openRecordId={7} onOpened={() => {}} />);

    expect(await screen.findByText(/New Castle, Delaware/)).toBeTruthy();
  });

  it("brings the conversation back with it", async () => {
    vi.spyOn(api, "fetchDocument").mockResolvedValue(
      detail({
        transcript: [{ role: "user", content: "An NDA with Initech, please." }],
      }),
    );
    vi.spyOn(api, "saveDocument").mockResolvedValue(detail());

    render(<DocumentCreator openRecordId={7} onOpened={() => {}} />);

    expect(await screen.findByText("An NDA with Initech, please.")).toBeTruthy();
  });

  it("does not create a second row for a document that already has one", async () => {
    const create = vi.spyOn(api, "createDocument").mockResolvedValue(detail());
    vi.spyOn(api, "fetchDocument").mockResolvedValue(detail());
    vi.spyOn(api, "saveDocument").mockResolvedValue(detail());

    render(<DocumentCreator openRecordId={7} onOpened={() => {}} />);
    await screen.findByRole("region", { name: "Document preview" });

    expect(create).not.toHaveBeenCalled();
  });

  it("falls back to the local draft when the document cannot be fetched", async () => {
    /** Deleted, or someone else's. Better than an empty screen. */
    vi.spyOn(api, "fetchDocument").mockRejectedValue(new api.ApiError(404, "gone"));
    vi.spyOn(api, "createDocument").mockResolvedValue(detail());
    vi.spyOn(api, "saveDocument").mockResolvedValue(detail());
    saveDraft({ documentId: MUTUAL_NDA_ID, recordId: null, values: defaultValues() });

    render(<DocumentCreator openRecordId={99} onOpened={() => {}} />);

    expect(
      await screen.findByRole("region", { name: "Document preview" }),
    ).toBeTruthy();
  });
});

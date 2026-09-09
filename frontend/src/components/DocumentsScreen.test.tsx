// @vitest-environment jsdom
/** The list of what someone has drafted, and the ways it can be empty. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DocumentsScreen from "./DocumentsScreen";
import * as api from "@/lib/api";

const row = (over: Partial<api.DocumentSummary> = {}): api.DocumentSummary => ({
  id: 1,
  documentType: "mutual-nda",
  title: "Mutual Non-Disclosure Agreement",
  createdAt: "2026-03-01T10:00:00Z",
  updatedAt: "2026-03-02T14:05:00Z",
  ...over,
});

const list = (documents: api.DocumentSummary[]) =>
  vi.spyOn(api, "listDocuments").mockResolvedValue(documents);

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("the documents list", () => {
  it("shows each saved document by title", async () => {
    list([row(), row({ id: 2, title: "Pilot Agreement" })]);

    render(<DocumentsScreen onOpen={() => {}} onStartNew={() => {}} />);

    expect(await screen.findByText("Mutual Non-Disclosure Agreement")).toBeTruthy();
    expect(screen.getByText("Pilot Agreement")).toBeTruthy();
  });

  it("opens the document that was clicked", async () => {
    const onOpen = vi.fn();
    list([row({ id: 7 })]);

    render(<DocumentsScreen onOpen={onOpen} onStartNew={() => {}} />);
    fireEvent.click(await screen.findByText("Mutual Non-Disclosure Agreement"));

    expect(onOpen).toHaveBeenCalledWith(7);
  });

  it("invites a first document when there are none", async () => {
    list([]);

    render(<DocumentsScreen onOpen={() => {}} onStartNew={() => {}} />);

    expect(await screen.findByText("Nothing here yet")).toBeTruthy();
  });

  it("says so, and offers a retry, when the list cannot be loaded", async () => {
    vi.spyOn(api, "listDocuments").mockRejectedValue(
      new api.ApiError(0, "Could not reach the server. Is it running?"),
    );

    render(<DocumentsScreen onOpen={() => {}} onStartNew={() => {}} />);

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Could not reach the server",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("asks again when the retry is pressed", async () => {
    const listing = vi
      .spyOn(api, "listDocuments")
      .mockRejectedValueOnce(new api.ApiError(500, "Went wrong"))
      .mockResolvedValueOnce([row()]);

    render(<DocumentsScreen onOpen={() => {}} onStartNew={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Mutual Non-Disclosure Agreement")).toBeTruthy();
    expect(listing).toHaveBeenCalledTimes(2);
  });

  it("is honest that saved documents do not survive a restart", async () => {
    /**
     * The database is dropped on every start, by design. A list that implied
     * otherwise would be the one place this product misleads someone about
     * where their agreement has gone.
     */
    list([row()]);

    render(<DocumentsScreen onOpen={() => {}} onStartNew={() => {}} />);
    await screen.findByText("Mutual Non-Disclosure Agreement");

    expect(document.body.textContent).toMatch(/restart/i);
  });
});

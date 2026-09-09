// @vitest-environment jsdom
/**
 * Which screen you land on, and what happens to it when you sign out.
 *
 * The reset is the part worth pinning down: without it the view survives a
 * sign-out, so signing out from the editor and back in as someone else lands
 * the second person in the editor.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Home from "./page";
import { AuthProvider } from "@/contexts/AuthContext";
import * as api from "@/lib/api";

const ada = { id: 1, name: "Ada Lovelace", email: "ada@example.com" };

const app = () => (
  <AuthProvider>
    <Home />
  </AuthProvider>
);

beforeEach(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(api, "listDocuments").mockResolvedValue([]);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("where signing in lands", () => {
  it("shows the documents list, not the editor", async () => {
    /** What the ticket asks people to be able to look back at. */
    vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(ada);

    render(app());

    expect(await screen.findByRole("heading", { name: "Your documents" })).toBeTruthy();
  });

  it("shows the sign-in screen when there is no session", async () => {
    vi.spyOn(api, "fetchCurrentUser").mockRejectedValue(new api.ApiError(401, "no"));

    render(app());

    expect(await screen.findByLabelText("Email address")).toBeTruthy();
  });
});

describe("signing out", () => {
  it("puts the view back, so the next person does not land in the editor", async () => {
    vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(ada);
    vi.spyOn(api, "signOut").mockResolvedValue(undefined);
    render(app());
    await screen.findByRole("heading", { name: "Your documents" });

    // Into the editor, then out of the account entirely.
    await act(async () => {
      screen.getByRole("button", { name: "New document" }).click();
    });
    // The heading is gone; the app bar's link back to it is not.
    expect(screen.queryByRole("heading", { name: "Your documents" })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    });

    // Back in as someone else: the list, not whatever was last open.
    vi.spyOn(api, "fetchCurrentUser").mockResolvedValue(ada);
    vi.spyOn(api, "signIn").mockResolvedValue(ada);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Email address"), {
        target: { value: "grace@example.com" },
      });
      fireEvent.change(screen.getByLabelText("Password"), {
        target: { value: "a password" },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    });

    expect(await screen.findByRole("heading", { name: "Your documents" })).toBeTruthy();
  });
});

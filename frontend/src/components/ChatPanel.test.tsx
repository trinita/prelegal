// @vitest-environment jsdom
/**
 * The chat's behaviour when a send fails.
 *
 * This is the one component with a test, because the bug it describes actually
 * happened: a failed send dropped the user's message entirely, and "Try again"
 * resent the conversation without it — while a comment in the file claimed the
 * opposite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ChatPanel from "./ChatPanel";
import { defaultValues } from "@/lib/fields";
import * as chat from "@/lib/chat";

function type(text: string) {
  fireEvent.change(screen.getByLabelText("Your message"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

beforeEach(() => {
  window.localStorage.clear();
  // jsdom implements no layout, so it has no scrollIntoView. Every browser
  // does; this is a gap in the runner, not in the component.
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("when a send fails", () => {
  it("keeps the message in the transcript instead of losing it", async () => {
    vi.spyOn(chat, "sendChatMessage").mockRejectedValue(new Error("offline"));

    render(<ChatPanel values={defaultValues()} onChange={() => {}} />);
    type("Delaware law please");

    expect(await screen.findByText("Delaware law please")).toBeTruthy();
  });

  it("resends that message when Try again is pressed", async () => {
    const send = vi
      .spyOn(chat, "sendChatMessage")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        reply: "Noted.",
        values: defaultValues(),
        outstanding: [],
      });

    render(<ChatPanel values={defaultValues()} onChange={() => {}} />);
    type("Delaware law please");

    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    // The retry must carry the message that failed, not the history before it.
    const [resent] = send.mock.calls[1];
    expect(resent.at(-1)).toEqual({ role: "user", content: "Delaware law please" });
  });
});

describe("on a successful send", () => {
  it("shows the reply and hands the new values up", async () => {
    const updated = { ...defaultValues(), governingLaw: "Delaware" };
    vi.spyOn(chat, "sendChatMessage").mockResolvedValue({
      reply: "Delaware it is.",
      values: updated,
      outstanding: [],
    });
    const onChange = vi.fn();

    render(<ChatPanel values={defaultValues()} onChange={onChange} />);
    type("Delaware law please");

    expect(await screen.findByText("Delaware it is.")).toBeTruthy();
    // The transcript and the document move together, or the chat would claim
    // something the preview does not show.
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(updated));
  });
});

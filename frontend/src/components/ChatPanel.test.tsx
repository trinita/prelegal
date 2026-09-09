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
import { MUTUAL_NDA_ID } from "@/lib/documents";
import * as chat from "@/lib/chat";

const onMnda = { documentId: MUTUAL_NDA_ID, recordId: null, values: defaultValues() };

/** A panel already working on the Mutual NDA. */
const panel = (props: Partial<Parameters<typeof ChatPanel>[0]> = {}) => (
  <ChatPanel
    workspace={onMnda}
    onChange={() => {}}
    onDocumentChosen={() => {}}
    {...props}
  />
);

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

    render(panel());
    type("Delaware law please");

    expect(await screen.findByText("Delaware law please")).toBeTruthy();
  });

  it("resends that message when Try again is pressed", async () => {
    const send = vi
      .spyOn(chat, "sendChatMessage")
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        reply: "Noted.",
        documentId: MUTUAL_NDA_ID,
        values: defaultValues(),
        outstanding: [],
      });

    render(panel());
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
      documentId: MUTUAL_NDA_ID,
      values: updated,
      outstanding: [],
    });
    const onChange = vi.fn();

    render(panel({ onChange }));
    type("Delaware law please");

    expect(await screen.findByText("Delaware it is.")).toBeTruthy();
    // The transcript and the document move together, or the chat would claim
    // something the preview does not show.
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    // The change is expressed as an update on the latest state, so a reply
    // cannot write over something that changed while it was in flight.
    const update = onChange.mock.calls[0][0] as (w: typeof onMnda) => typeof onMnda;
    expect(update(onMnda)).toEqual({ ...onMnda, values: updated });
  });

  it("does not write its answer onto a document the user has since changed", async () => {
    // The reply was computed for the Mutual NDA; by the time it lands the user
    // is drafting something else, and its values would be meaningless there.
    vi.spyOn(chat, "sendChatMessage").mockResolvedValue({
      reply: "Noted.",
      documentId: MUTUAL_NDA_ID,
      values: { ...defaultValues(), governingLaw: "Delaware" },
      outstanding: [],
    });
    const onChange = vi.fn();

    render(panel({ onChange }));
    type("Delaware law please");

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const update = onChange.mock.calls[0][0] as (w: {
      documentId: string;
      values: object;
    }) => unknown;
    const movedOn = { documentId: "pilot-agreement", values: { provider: "Acme" } };

    expect(update(movedOn)).toBe(movedOn);
  });

  it("says when it is waiting, so the fields cannot be edited underneath it", async () => {
    let release: (value: never) => void = () => {};
    vi.spyOn(chat, "sendChatMessage").mockReturnValue(
      new Promise((resolve) => {
        release = resolve as (value: never) => void;
      }),
    );
    const onBusyChange = vi.fn();

    render(panel({ onBusyChange }));
    type("Delaware law please");

    await waitFor(() => expect(onBusyChange).toHaveBeenCalledWith(true));

    release({
      reply: "Noted.",
      documentId: MUTUAL_NDA_ID,
      values: defaultValues(),
      outstanding: [],
    } as never);

    await waitFor(() => expect(onBusyChange).toHaveBeenLastCalledWith(false));
  });
});

describe("when the assistant settles on a document", () => {
  it("hands the choice up rather than merging values into the old one", async () => {
    vi.spyOn(chat, "sendChatMessage").mockResolvedValue({
      reply: "A pilot agreement, then.",
      documentId: "pilot-agreement",
      values: {},
      outstanding: ["provider"],
    });
    const onDocumentChosen = vi.fn();
    const onChange = vi.fn();

    render(
      panel({
        workspace: { documentId: null, recordId: null, values: {} },
        onDocumentChosen,
        onChange,
      }),
    );
    type("I need a pilot agreement");

    await waitFor(() => expect(onDocumentChosen).toHaveBeenCalledWith("pilot-agreement"));
    // The old document's values must not be merged into the new one.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("stays put while the assistant is still working out what they need", async () => {
    vi.spyOn(chat, "sendChatMessage").mockResolvedValue({
      reply: "I can't produce an employment contract. The closest is an NDA.",
      documentId: null,
      values: {},
      outstanding: [],
    });
    const onDocumentChosen = vi.fn();

    render(panel({ workspace: { documentId: null, recordId: null, values: {} }, onDocumentChosen }));
    type("I need an employment contract");

    expect(await screen.findByText(/employment contract/)).toBeTruthy();
    expect(onDocumentChosen).not.toHaveBeenCalled();
  });
});

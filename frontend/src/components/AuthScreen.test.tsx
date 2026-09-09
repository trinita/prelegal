// @vitest-environment jsdom
/**
 * The way into the platform, which PL-7 left untested because there was nothing
 * to test: it took a name and trusted it. There is a real credential now, and
 * two modes that must not be confused with one another.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AuthScreen from "./AuthScreen";
import { AuthProvider } from "@/contexts/AuthContext";
import * as api from "@/lib/api";

const screenUnderTest = () => (
  <AuthProvider>
    <AuthScreen />
  </AuthProvider>
);

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: /sign in|create account$/i }));

beforeEach(() => {
  // No session, so the provider settles on the sign-in screen.
  vi.spyOn(api, "fetchCurrentUser").mockRejectedValue(new api.ApiError(401, "no"));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("signing in", () => {
  it("sends the email and password, and no name", async () => {
    const signIn = vi
      .spyOn(api, "signIn")
      .mockResolvedValue({ id: 1, name: "Ada", email: "ada@example.com" });
    render(screenUnderTest());
    await screen.findByLabelText("Email address");

    fill("Email address", "ada@example.com");
    fill("Password", "a password");
    submit();

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "a password",
      }),
    );
  });

  it("does not ask for a name", async () => {
    render(screenUnderTest());
    await screen.findByLabelText("Email address");

    expect(screen.queryByLabelText("Your name")).toBeNull();
  });

  it("shows what the server said when the password is wrong", async () => {
    vi.spyOn(api, "signIn").mockRejectedValue(
      new api.ApiError(401, "Incorrect email or password"),
    );
    render(screenUnderTest());
    await screen.findByLabelText("Email address");

    fill("Email address", "ada@example.com");
    fill("Password", "not it");
    submit();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Incorrect email or password",
    );
  });

  it("lets the user try again after a failure", async () => {
    /** The button must not stay disabled once the error is on screen. */
    vi.spyOn(api, "signIn").mockRejectedValue(new api.ApiError(401, "Nope"));
    render(screenUnderTest());
    await screen.findByLabelText("Email address");

    fill("Email address", "ada@example.com");
    fill("Password", "not it");
    submit();
    await screen.findByRole("alert");

    const button = screen.getByRole("button", { name: /^sign in$/i });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("registering", () => {
  const switchToSignUp = () =>
    fireEvent.click(screen.getByRole("tab", { name: "Create account" }));

  it("asks for a name as well", async () => {
    render(screenUnderTest());
    await screen.findByLabelText("Email address");

    switchToSignUp();

    expect(screen.getByLabelText("Your name")).toBeTruthy();
  });

  it("registers rather than signing in", async () => {
    const signUp = vi
      .spyOn(api, "signUp")
      .mockResolvedValue({ id: 1, name: "Ada", email: "ada@example.com" });
    const signIn = vi.spyOn(api, "signIn");
    render(screenUnderTest());
    await screen.findByLabelText("Email address");

    switchToSignUp();
    fill("Your name", "Ada Lovelace");
    fill("Email address", "ada@example.com");
    fill("Password", "a long enough one");
    submit();

    await waitFor(() =>
      expect(signUp).toHaveBeenCalledWith({
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "a long enough one",
      }),
    );
    expect(signIn).not.toHaveBeenCalled();
  });

  it("will not submit a password that is too short to be accepted", async () => {
    /** Refused here rather than by a 422, which explains nothing useful. */
    render(screenUnderTest());
    await screen.findByLabelText("Email address");

    switchToSignUp();
    fill("Your name", "Ada");
    fill("Email address", "ada@example.com");
    fill("Password", "short");

    const button = screen.getByRole("button", { name: /create account$/i });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("clears a sign-in error when switching to registering", async () => {
    /** "Incorrect email or password" says nothing about creating an account. */
    vi.spyOn(api, "signIn").mockRejectedValue(new api.ApiError(401, "Nope"));
    render(screenUnderTest());
    await screen.findByLabelText("Email address");

    fill("Email address", "ada@example.com");
    fill("Password", "not it");
    submit();
    await screen.findByRole("alert");

    switchToSignUp();

    expect(screen.queryByRole("alert")).toBeNull();
  });
});

"use client";

/**
 * The way into the platform: sign in, or register.
 *
 * PL-7's version took a name and nothing else, and said so plainly, because a
 * password box that accepted anything would have implied a check that was not
 * happening. The check is real now — the password is verified against a stored
 * scrypt hash — so the form asks for one.
 *
 * The notice at the foot has changed subject rather than gone away. It no
 * longer has to warn that the login is a pretence; it does have to say that the
 * database is emptied when the server restarts, because an account that quietly
 * disappears is worse than one that never claimed to persist.
 */
import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";

type Mode = "signIn" | "signUp";

const MINIMUM_PASSWORD = 8;

export default function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const registering = mode === "signUp";
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();

  // Only what the browser can know on its own. Everything else — whether the
  // address is taken, whether the password is right — is the server's answer.
  const incomplete =
    trimmedEmail === "" ||
    password === "" ||
    (registering && (trimmedName === "" || password.length < MINIMUM_PASSWORD));

  const change = (next: Mode) => {
    setMode(next);
    // An error about signing in has nothing to say about registering.
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (incomplete || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      if (registering) {
        await signUp({ name: trimmedName, email: trimmedEmail, password });
      } else {
        await signIn({ email: trimmedEmail, password });
      }
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Please try again.",
      );
      setSubmitting(false);
    }
    // On success this component unmounts, so there is no state left to reset.
  };

  return (
    <div className="login">
      <main className="login-card">
        <p className="login-wordmark">Prelegal</p>
        <h1>{registering ? "Create an account" : "Welcome back"}</h1>
        <p className="login-blurb">
          Lawyer-drafted agreements from{" "}
          <a
            href="https://commonpaper.com"
            rel="noreferrer noopener"
            target="_blank"
          >
            Common Paper
          </a>
          , filled in by describing what you need.
        </p>

        <div className="mode-switch" role="tablist" aria-label="Sign in or create an account">
          <button
            type="button"
            role="tab"
            aria-selected={!registering}
            className={!registering ? "mode-tab mode-tab-on" : "mode-tab"}
            onClick={() => change("signIn")}
          >
            Sign in
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={registering}
            className={registering ? "mode-tab mode-tab-on" : "mode-tab"}
            onClick={() => change("signUp")}
          >
            Create account
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {registering && (
            <>
              <label className="field-label" htmlFor="auth-name">
                Your name
              </label>
              <input
                id="auth-name"
                name="name"
                type="text"
                autoComplete="name"
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </>
          )}

          <label className="field-label" htmlFor="auth-email">
            Email address
          </label>
          <input
            id="auth-email"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            maxLength={255}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          <label className="field-label" htmlFor="auth-password">
            Password
          </label>
          <input
            id="auth-password"
            name="password"
            type="password"
            // Tells a password manager whether to offer a saved password or a
            // new one; without it, registering prompts to fill the old one in.
            autoComplete={registering ? "new-password" : "current-password"}
            maxLength={200}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={
              registering ? "auth-password-hint" : error ? "auth-error" : undefined
            }
            aria-invalid={error && !registering ? true : undefined}
          />
          {registering && (
            <p className="field-hint" id="auth-password-hint">
              At least {MINIMUM_PASSWORD} characters.
            </p>
          )}

          {error && (
            <p className="login-error" id="auth-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="button-submit" disabled={incomplete || submitting}>
            {submitting
              ? registering
                ? "Creating your account…"
                : "Signing in…"
              : registering
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <p className="login-notice">
          Preview build — the database is emptied whenever the server restarts,
          so accounts and saved documents do not outlive it. Download anything
          you want to keep.
        </p>
      </main>
    </div>
  );
}

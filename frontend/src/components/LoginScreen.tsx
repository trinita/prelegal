"use client";

/**
 * The way into the platform.
 *
 * Deliberately a name and nothing else: PL-7 stops short of authentication, and
 * a password box that accepted anything would imply a check that is not
 * happening. The notice under the form says as much, so nobody mistakes this
 * build for a secured one.
 */
import { useState, type FormEvent } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ApiError } from "@/lib/api";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const trimmed = name.trim();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (trimmed === "" || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      await signIn(trimmed);
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
        <h1>Draft an agreement</h1>
        <p className="login-blurb">
          Lawyer-drafted agreements from{" "}
          <a
            href="https://commonpaper.com"
            rel="noreferrer noopener"
            target="_blank"
          >
            Common Paper
          </a>
          , filled in and ready to sign.
        </p>

        <form onSubmit={handleSubmit} noValidate>
          <label className="field-label" htmlFor="login-name">
            Your name
          </label>
          <input
            id="login-name"
            name="name"
            type="text"
            autoComplete="name"
            autoFocus
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-describedby={error ? "login-error" : undefined}
            aria-invalid={error ? true : undefined}
          />

          {error && (
            <p className="login-error" id="login-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="button-submit"
            disabled={trimmed === "" || submitting}
          >
            {submitting ? "Signing in…" : "Continue"}
          </button>
        </form>

        <p className="login-notice">
          Preview build — any name will do. There are no passwords yet, and
          anything you sign in with is discarded when the server restarts.
        </p>
      </main>
    </div>
  );
}

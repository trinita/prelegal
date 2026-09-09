"use client";

/**
 * Who is signed in, for the whole app.
 *
 * PL-7 left a note here that the shape was the part that mattered, and that
 * screens other than the login should not have to change when passwords
 * arrived. They did not: `status` and `user` mean what they always meant, and
 * only the arguments to `signIn` are different.
 *
 * What is new is clearing the local draft whenever the signed-in person
 * changes. The draft used to be harmless — one browser, one nameless user — but
 * accounts make it a leak: sign out, hand the laptop over, and the next person
 * to sign in would find the last one's half-typed agreement waiting. Restoring
 * an existing session on page load deliberately does not clear it, so a refresh
 * still keeps what you were working on.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  fetchCurrentUser,
  signIn as requestSignIn,
  signUp as requestSignUp,
  signOut as requestSignOut,
  type Credentials,
  type User,
} from "@/lib/api";
import { clearDraft } from "@/lib/draft";
import { clearTranscript } from "@/lib/chat";

/** "checking" covers the first request, before we know either way. */
type AuthStatus = "checking" | "signedOut" | "signedIn";

interface AuthValue {
  status: AuthStatus;
  user: User | null;
  signIn: (credentials: Credentials) => Promise<void>;
  signUp: (registration: Credentials & { name: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("checking");
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchCurrentUser()
      .then((existing) => {
        if (cancelled) return;
        setUser(existing);
        setStatus("signedIn");
      })
      .catch(() => {
        // No session, an expired one, or no backend at all: either way there is
        // nobody signed in and the login screen is the right thing to show.
        if (cancelled) return;
        setUser(null);
        setStatus("signedOut");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /** Whatever this browser was drafting belonged to whoever was here before. */
  const forgetLocalWork = useCallback(() => {
    clearDraft();
    clearTranscript();
  }, []);

  const signIn = useCallback(
    async (credentials: Credentials) => {
      const signedIn = await requestSignIn(credentials);
      forgetLocalWork();
      setUser(signedIn);
      setStatus("signedIn");
    },
    [forgetLocalWork],
  );

  const signUp = useCallback(
    async (registration: Credentials & { name: string }) => {
      const registered = await requestSignUp(registration);
      forgetLocalWork();
      setUser(registered);
      setStatus("signedIn");
    },
    [forgetLocalWork],
  );

  const signOut = useCallback(async () => {
    try {
      await requestSignOut();
    } catch {
      // Swallowed on purpose. Whether or not the server acknowledged, this
      // browser is done with the session, and leaving the user apparently
      // signed in because the network faltered would be worse. Rethrowing
      // instead would surface as an unhandled rejection, since the only caller
      // is a click handler with nowhere to put an error.
      //
      // The cost used to be that a failed request left a still-valid cookie
      // behind. Since PL-10 the server deletes the session row, so a sign-out
      // that reached it is final; one that did not is the only case where a
      // refresh could sign the user back in.
    } finally {
      forgetLocalWork();
      setUser(null);
      setStatus("signedOut");
    }
  }, [forgetLocalWork]);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut }),
    [status, user, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within an AuthProvider");
  return value;
}

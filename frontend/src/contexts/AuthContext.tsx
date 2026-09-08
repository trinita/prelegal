"use client";

/**
 * Who is signed in, for the whole app.
 *
 * There is no real authentication yet (PL-7 asks for a fake login), so this
 * holds a name and an id and nothing more. The shape is the part that matters:
 * when PL-10 adds passwords, the screens consuming this context should not have
 * to change.
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
  signOut as requestSignOut,
  type User,
} from "@/lib/api";

/** "checking" covers the first request, before we know either way. */
type AuthStatus = "checking" | "signedOut" | "signedIn";

interface AuthValue {
  status: AuthStatus;
  user: User | null;
  signIn: (name: string) => Promise<void>;
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

  const signIn = useCallback(async (name: string) => {
    const signedIn = await requestSignIn(name);
    setUser(signedIn);
    setStatus("signedIn");
  }, []);

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
      // The cost: if the request never reached the server, its cookie is still
      // valid and a refresh signs the user back in. Worth revisiting in PL-10,
      // when a session is something more than a name.
    } finally {
      setUser(null);
      setStatus("signedOut");
    }
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signOut }),
    [status, user, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within an AuthProvider");
  return value;
}

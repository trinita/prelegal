"use client";

/**
 * The chrome around whichever document tool is open: who is signed in, and the
 * way back out. Hidden by the print stylesheet, so it never reaches the PDF.
 */
import { useAuth } from "@/contexts/AuthContext";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();

  return (
    <>
      <div className="app-bar">
        <p className="app-bar-wordmark">Prelegal</p>

        <div className="app-bar-account">
          {user && <span className="app-bar-user">{user.name}</span>}
          <button type="button" className="button-quiet" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>

      {children}
    </>
  );
}

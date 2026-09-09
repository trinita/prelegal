"use client";

/**
 * The chrome around whichever screen is open: where you are, who is signed in,
 * and the way back out. Hidden by the print stylesheet, so it never reaches the
 * PDF.
 */
import { useAuth } from "@/contexts/AuthContext";

interface Props {
  children: React.ReactNode;
  /** Absent on the documents list itself, which is where it would lead. */
  onShowDocuments?: () => void;
}

export default function AppShell({ children, onShowDocuments }: Props) {
  const { user, signOut } = useAuth();

  return (
    <>
      <div className="app-bar">
        <p className="app-bar-wordmark">Prelegal</p>

        <div className="app-bar-account">
          {onShowDocuments && (
            <button type="button" className="button-quiet" onClick={onShowDocuments}>
              Your documents
            </button>
          )}
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

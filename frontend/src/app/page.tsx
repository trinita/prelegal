"use client";

/**
 * The gate, and the way between the two screens behind it.
 *
 * A real `/login` route fits badly with a static export, which has to redirect
 * on the client and so shows the wrong screen for a frame. Swapping components
 * here avoids that, and the same reasoning covers the documents list: it is a
 * piece of state, not a URL, so arriving at it costs no navigation.
 *
 * Signing in lands on the list rather than the editor. It is what the ticket
 * asks people to be able to look back at, and on a shared machine it opens on
 * your own documents instead of whatever the last person left half-finished.
 */
import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import AuthScreen from "@/components/AuthScreen";
import DocumentCreator from "@/components/DocumentCreator";
import DocumentsScreen from "@/components/DocumentsScreen";
import { useAuth } from "@/contexts/AuthContext";

type View = "documents" | "editor";

export default function Home() {
  const { status } = useAuth();
  const [view, setView] = useState<View>("documents");
  //  Which saved document the editor should open, cleared once it has.
  const [openRecordId, setOpenRecordId] = useState<number | null>(null);

  const openDocument = useCallback((id: number) => {
    setOpenRecordId(id);
    setView("editor");
  }, []);

  const startNew = useCallback(() => {
    setOpenRecordId(null);
    setView("editor");
  }, []);

  const forgetOpened = useCallback(() => setOpenRecordId(null), []);

  useEffect(() => {
    // Signing out has to put the view back, or it survives into the next
    // session: sign out from the editor, sign in as someone else, and they
    // land on the editor holding a document that is not theirs to see.
    if (status === "signedOut") {
      setView("documents");
      setOpenRecordId(null);
    }
  }, [status]);

  if (status === "checking") {
    return (
      <div className="splash" role="status">
        <p>Loading…</p>
      </div>
    );
  }

  if (status === "signedOut") return <AuthScreen />;

  if (view === "documents") {
    return (
      <AppShell>
        <DocumentsScreen onOpen={openDocument} onStartNew={startNew} />
      </AppShell>
    );
  }

  return (
    <AppShell onShowDocuments={() => setView("documents")}>
      <DocumentCreator openRecordId={openRecordId} onOpened={forgetOpened} />
    </AppShell>
  );
}

"use client";

/**
 * The gate. One page, three states: still asking the server who you are, the
 * login screen, or the platform itself.
 *
 * The alternative - a real `/login` route - fits badly with a static export,
 * which has to redirect on the client and so shows the wrong screen for a
 * frame. Swapping components here avoids that, and the app has a single
 * destination for as long as there is a single tool inside it.
 */
import AppShell from "@/components/AppShell";
import LoginScreen from "@/components/LoginScreen";
import DocumentCreator from "@/components/DocumentCreator";
import { useAuth } from "@/contexts/AuthContext";

export default function Home() {
  const { status } = useAuth();

  if (status === "checking") {
    return (
      <div className="splash" role="status">
        <p>Loading…</p>
      </div>
    );
  }

  if (status === "signedOut") return <LoginScreen />;

  return (
    <AppShell>
      <DocumentCreator />
    </AppShell>
  );
}

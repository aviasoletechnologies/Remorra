import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { AuthPage } from "../pages/auth";

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      return;
    }
    const client = supabase;
    void client.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        setSession(null);
        return;
      }
      const { data: userData, error } = await client.auth.getUser();
      if (error || !userData.user) {
        const refreshed = await client.auth.refreshSession();
        if (!refreshed.data.session) {
          await client.auth.signOut({ scope: "local" });
        }
        setSession(refreshed.data.session);
        return;
      }
      setSession(data.session);
    });
    const { data } = client.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    const expire = () => setSession(null);
    window.addEventListener("remorra-session-expired", expire);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener("remorra-session-expired", expire);
    };
  }, []);

  if (!supabaseConfigured) {
    return (
      <main className="configuration-page">
        <div className="brand-mark">R</div>
        <h1>Connect Remorra to Supabase</h1>
        <p>
          Set <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> to activate secure sign-in.
        </p>
      </main>
    );
  }
  if (session === undefined) {
    return <main className="loading-page">Loading secure workspace...</main>;
  }
  if (!session) return <AuthPage />;
  return children;
}

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
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => data.subscription.unsubscribe();
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

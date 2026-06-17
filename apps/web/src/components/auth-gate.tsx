import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../lib/supabase";
import { AuthPage } from "../pages/auth";
import { Skeleton } from "./ui/skeleton";
import { Card } from "./ui/card";

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
    return (
      <main className="min-h-screen grid lg:grid-cols-2 bg-background animate-pulse" role="status" aria-label="Loading secure workspace...">
        <span className="sr-only">Loading secure workspace...</span>
        {/* Left side: Premium Branding skeleton */}
        <section className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-[#16132a]">
          <div className="absolute inset-0 bg-gradient-to-br from-[#241d4d] to-[#100d20] opacity-90 z-0" />
          <div className="relative z-10 flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-xl bg-accent" />
            <Skeleton className="h-6 w-24 bg-white/10" />
          </div>
          <div className="relative z-10 max-w-lg pb-12">
            <Skeleton className="h-6 w-36 bg-accent/20 rounded-full mb-8" />
            <Skeleton className="h-10 w-full bg-white/10 mb-4" />
            <Skeleton className="h-10 w-4/5 bg-white/10 mb-6" />
            <Skeleton className="h-4 w-11/12 bg-white/5" />
          </div>
        </section>

        {/* Right side: Auth Form skeleton */}
        <section className="flex flex-col items-center justify-center p-6 sm:p-12 bg-background relative">
          <div className="w-full max-w-[420px] relative z-10">
            <Card className="rounded-2xl border-border bg-card/85 p-8 shadow-2xl backdrop-blur-xl flex flex-col gap-6">
              <div>
                <Skeleton className="h-7 w-32 mb-2" />
                <Skeleton className="h-4 w-64" />
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-11 w-full" />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-11 w-full" />
                </div>
                <Skeleton className="h-11 w-full mt-2" />
              </div>
              <div className="flex justify-center mt-2">
                <Skeleton className="h-4 w-44" />
              </div>
            </Card>
          </div>
        </section>
      </main>
    );
  }
  if (!session) return <AuthPage />;
  return children;
}

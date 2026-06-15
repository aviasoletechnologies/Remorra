import { useState } from "react";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { Button, Card } from "../components/ui";
import { supabase } from "../lib/supabase";

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMessage("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage("Password reset email sent.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="brand auth-brand"><span className="brand-mark">R</span><strong>remorra</strong></div>
        <div>
          <span className="eyebrow">Product intelligence for founders</span>
          <h1>Keep every product decision connected to delivery.</h1>
          <p>Move from a raw idea to a build-ready product with structured AI guidance and human approval at every step.</p>
        </div>
      </section>
      <Card className="auth-card">
        <span className="eyebrow">{mode === "login" ? "Welcome back" : mode === "signup" ? "Create your workspace" : "Recover access"}</span>
        <h2>{mode === "login" ? "Sign in to Remorra" : mode === "signup" ? "Start with clarity" : "Reset your password"}</h2>
        <form onSubmit={submit}>
          <label>Email address<div className="auth-input"><Mail size={16} /><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div></label>
          {mode !== "reset" && <label>Password<div className="auth-input"><KeyRound size={16} /><input type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></div></label>}
          {message && <p className="form-message">{message}</p>}
          <Button disabled={busy} type="submit">{busy ? "Working…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset email"} <ArrowRight size={15} /></Button>
        </form>
        <div className="auth-links">
          <button onClick={() => setMode(mode === "signup" ? "login" : "signup")}>{mode === "signup" ? "Already have an account?" : "Create an account"}</button>
          <button onClick={() => setMode("reset")}>Forgot password?</button>
        </div>
      </Card>
    </main>
  );
}

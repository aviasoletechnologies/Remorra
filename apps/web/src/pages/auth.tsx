import { useState } from "react";
import { ArrowRight, KeyRound, Mail, Sparkles } from "lucide-react";
import { Button, Card, Input } from "../components/ui";
import { supabase } from "../lib/supabase";
import { motion, AnimatePresence } from "framer-motion";

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
    <main className="min-h-screen grid lg:grid-cols-2 bg-canvas">
      {/* Left side: Premium Branding */}
      <section className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-[#131d18]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#1b2f25] to-[#0f1713] opacity-90 z-0" />
        {/* Animated background blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-accent/30 blur-[120px] rounded-full z-0" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent-dark/40 blur-[140px] rounded-full z-0" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent text-white grid place-items-center font-bold text-xl shadow-lg shadow-accent/20">
            R
          </div>
          <strong className="text-white text-2xl tracking-tight font-sans">remorra</strong>
        </div>
        
        <div className="relative z-10 max-w-lg pb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/20 border border-accent/30 text-accent-soft text-xs font-semibold uppercase tracking-wider mb-8">
            <Sparkles size={14} /> Product intelligence
          </div>
          <h1 className="text-5xl font-bold text-white leading-[1.1] tracking-tight mb-6">
            Keep every product decision connected to delivery.
          </h1>
          <p className="text-lg text-white/70 leading-relaxed font-medium">
            Move from a raw idea to a build-ready product with structured AI guidance and human approval at every step.
          </p>
        </div>
      </section>

      {/* Right side: Auth Form */}
      <section className="flex flex-col items-center justify-center p-6 sm:p-12 bg-canvas relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-accent/5 via-transparent to-transparent opacity-60" />
        
        <div className="w-full max-w-[420px] relative z-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Card className="rounded-2xl border-border bg-card/85 p-8 shadow-2xl shadow-ink/5 backdrop-blur-xl">
                <div className="mb-8">
                  <h2 className="text-2xl font-bold tracking-tight text-ink mb-2">
                    {mode === "login" ? "Welcome back" : mode === "signup" ? "Start with clarity" : "Reset your password"}
                  </h2>
                  <p className="text-sm text-muted">
                    {mode === "login" ? "Enter your credentials to access your workspace." : mode === "signup" ? "Create your workspace and start building." : "We'll send you instructions to recover access."}
                  </p>
                </div>

                <form onSubmit={submit} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-ink uppercase tracking-wider">Email address</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={16} />
                      <Input 
                        type="email" 
                        required 
                        value={email} 
                        onChange={(event) => setEmail(event.target.value)} 
                        className="h-11 pl-10 shadow-sm"
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>

                  {mode !== "reset" && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-ink uppercase tracking-wider">Password</label>
                        {mode === "login" && (
                          <button 
                            type="button" 
                            onClick={() => setMode("reset")}
                            className="text-xs font-semibold text-accent hover:text-accent-dark transition-colors"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" size={16} />
                        <Input 
                          type="password" 
                          minLength={8} 
                          required 
                          value={password} 
                          onChange={(event) => setPassword(event.target.value)} 
                          className="h-11 pl-10 shadow-sm"
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                  )}

                  {message && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }} 
                      animate={{ opacity: 1, height: "auto" }} 
                      className={`rounded-lg border p-3 text-sm font-medium ${message.includes("failed") || message.includes("Error") ? "border-destructive/20 bg-destructive/10 text-destructive" : "border-primary/20 bg-accent-soft text-accent-dark"}`}
                    >
                      {message}
                    </motion.div>
                  )}

                  <Button 
                    disabled={busy} 
                    type="submit" 
                    className="w-full h-11 text-sm font-semibold shadow-md shadow-accent/20 mt-2"
                  >
                    {busy ? "Working…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset email"}
                    <ArrowRight size={16} className="ml-2" />
                  </Button>
                </form>

                <div className="mt-8 text-center">
                  <p className="text-sm text-muted">
                    {mode === "signup" ? "Already have an account?" : mode === "login" ? "Don't have an account?" : "Remember your password?"}{" "}
                    <button 
                      onClick={() => setMode(mode === "signup" ? "login" : "signup")}
                      className="font-bold text-accent hover:text-accent-dark transition-colors"
                    >
                      {mode === "signup" ? "Sign in" : "Create one"}
                    </button>
                  </p>
                </div>
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </main>
  );
}

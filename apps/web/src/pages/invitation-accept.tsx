import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, ArrowRight, Sparkles } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card } from "../components/ui";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";

export function InvitationAcceptPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setActiveProjectId = useWorkspaceStore((state) => state.setActiveProjectId);
  const token = params.get("token") ?? "";

  const accept = useMutation({
    mutationFn: () =>
      api<{ projectId: string }>(`/invitations/${encodeURIComponent(token)}/accept`, { method: "POST" }),
    onSuccess: (data) => {
      // Team members always enter Venture directly — they skip DRI
      if (data?.projectId) {
        setActiveProjectId(data.projectId);
      }
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      navigate("/venture", { replace: true });
    },
  });

  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left side: Premium Branding */}
      <section className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-[#16132a]">
        <div className="absolute inset-0 bg-gradient-to-br from-[#241d4d] to-[#100d20] opacity-90 z-0" />
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
            <Sparkles size={14} /> Project Onboarding
          </div>
          <h1 className="text-5xl font-bold text-white leading-[1.1] tracking-tight mb-6">
            Join your team's workspace.
          </h1>
          <p className="text-lg text-white/70 leading-relaxed font-medium">
            Collaborate on epics, stories, and persona delivery as a project team member.
          </p>
        </div>
      </section>

      {/* Right side: Invitation Acceptance Card */}
      <section className="flex flex-col items-center justify-center p-6 sm:p-12 bg-background relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-accent/5 via-transparent to-transparent opacity-60" />

        <div className="w-full max-w-[440px] relative z-10">
          <Card className="rounded-2xl border-border bg-card/85 p-8 shadow-2xl shadow-ink/5 backdrop-blur-xl flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6 shadow-inner">
              <UserPlus size={28} />
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-foreground mb-3">
              Join this Remorra project
            </h2>

            <p className="text-sm leading-relaxed text-muted-foreground mb-8">
              Your project role will be resolved independently. Once accepted, you'll enter the project workspace directly to view and edit team items.
            </p>

            {accept.error && (
              <div className="w-full rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm font-medium text-destructive mb-6">
                {accept.error.message}
              </div>
            )}

            <Button
              disabled={!token || accept.isPending || accept.isSuccess}
              onClick={() => accept.mutate()}
              className="w-full h-11 text-sm font-semibold shadow-md shadow-accent/20"
            >
              {accept.isPending ? (
                "Joining..."
              ) : accept.isSuccess ? (
                "Redirecting..."
              ) : (
                <>
                  Accept invitation
                  <ArrowRight size={16} className="ml-2" />
                </>
              )}
            </Button>
          </Card>
        </div>
      </section>
    </main>
  );
}

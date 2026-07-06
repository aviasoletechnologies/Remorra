import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Activity, ArrowLeft, ArrowRight, Gauge, Sparkles } from "lucide-react";
import { Button, Card, Progress } from "../components/ui";
import { buttonVariants } from "../components/ui/button";
import { cn } from "../lib/utils";
import { EmptyState, MetricCard, Page, PageHeader, SectionCard, MetricGridSkeleton, CardSkeleton } from "../components/app-ui";
import { api, advancePhase, waitForJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import type { Project } from "@remorra/contracts";

export function InitiatePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/projects"),
    enabled: Boolean(projectId),
  });
  const project = projects.find((p) => p.id === projectId);

  const { data: score, isLoading } = useQuery({
    queryKey: ["health-score", projectId],
    queryFn: () => api<any>(`/projects/${projectId}/health-score`),
    enabled: Boolean(projectId),
  });

  const calculate = useMutation({
    mutationFn: async () => {
      const job = await api<{ id: string }>(`/projects/${projectId}/health-score/calculate`, { method: "POST" });
      return waitForJob(job.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["health-score", projectId] });
    },
  });

  // Phase 5 (Stripe) isn't built yet — this stands in for the real paywall's
  // "proceed and pay" action. HARDIK doc Q13: a low score doesn't block this.
  const proceedToVenture = useMutation({
    mutationFn: () => advancePhase(projectId!, "venture", project!.version),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const components = score?.components ?? [];
  const actions = components.flatMap((c: any) => (Array.isArray(c.actions) ? c.actions : []));
  const isReadOnly = project ? project.phase !== "initiate" : false;

  return (
    <Page>
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Initiate"
          tone="blue"
          title="Health Score readiness"
          description={
            isReadOnly
              ? "Read-only record of the readiness snapshot calculated before this project moved on."
              : "A one-time, evidence-based readiness snapshot: is this project well-defined enough to build?"
          }
          actions={
            isReadOnly ? (
              <Link to="/venture" className={cn(buttonVariants({ variant: "outline" }))}>
                <ArrowLeft size={14} />
                Back to Delivery
              </Link>
            ) : (
              <div className="flex gap-2">
                <Button disabled={calculate.isPending} onClick={() => calculate.mutate()}>
                  <Sparkles size={16} />
                  {calculate.isPending ? "Calculating..." : score ? "Recalculate" : "Calculate Health Score"}
                </Button>
                {score ? (
                  <Button
                    variant="outline"
                    disabled={proceedToVenture.isPending || !project}
                    onClick={() => proceedToVenture.mutate()}
                  >
                    {proceedToVenture.isPending ? "Advancing..." : "Continue to Venture"}
                    <ArrowRight size={14} />
                  </Button>
                ) : null}
              </div>
            )
          }
        />

        {proceedToVenture.error ? (
          <Card className="border-destructive/25 bg-destructive-soft/30 p-6">
            <p className="m-0 text-sm text-destructive">{proceedToVenture.error.message}</p>
          </Card>
        ) : null}

        {calculate.error ? (
          <Card className="border-destructive/25 bg-destructive-soft/30 p-6">
            <h2 className="mb-2 text-base font-bold text-destructive">Calculation failed</h2>
            <p className="m-0 text-sm leading-6 text-destructive">{calculate.error.message}</p>
          </Card>
        ) : null}

        {isLoading ? (
          <div className="flex flex-col gap-6">
            <MetricGridSkeleton count={4} />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_.65fr]">
              <CardSkeleton rows={4} />
              <CardSkeleton rows={4} />
            </div>
          </div>
        ) : !score ? (
          <EmptyState title="No Health Score yet" description="Complete a connected Refine thread, then calculate the first Initiate score." />
        ) : (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Overall Health Score" value={score.overallScore} detail={new Date(score.calculatedAt).toLocaleDateString()} icon={Gauge} tone="blue" />
              {components.slice(0, 3).map((c: any) => (
                <MetricCard
                  key={c.component}
                  label={c.component.replaceAll("_", " ")}
                  value={c.score}
                  detail={`Weight ${c.weight}%`}
                  icon={Activity}
                />
              ))}
            </section>

            <SectionCard title="Component scores" description="The weighted signals behind the readiness snapshot">
              <div className="grid gap-4 md:grid-cols-2">
                {components.map((c: any) => (
                  <div className="rounded-xl border border-border bg-secondary/35 p-4" key={c.component}>
                    <div className="mb-3 flex items-center justify-between gap-4 text-xs">
                      <strong className="capitalize">{c.component.replaceAll("_", " ")}</strong>
                      <span className="font-bold text-foreground">{c.score}</span>
                    </div>
                    <Progress value={c.score} label={`${c.component} score`} />
                    <p className="mt-3 mb-0 text-xs leading-5 text-muted-foreground">{c.rationale}</p>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="Why this score" description="Readiness assessment">
              <p className="m-0 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{score.readinessAssessment}</p>
            </SectionCard>

            <SectionCard title="Prioritized readiness actions" description="Next actions to improve the score">
              {actions.length ? (
                <div className="grid gap-3">
                  {actions.map((action: string, index: number) => (
                    <div className="flex gap-3 rounded-xl border border-warning/15 bg-warning-soft/35 p-4" key={index}>
                      <Activity size={18} className="mt-0.5 shrink-0 text-warning" />
                      <span className="text-sm leading-6">{action}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="m-0 text-sm text-muted-foreground">No further actions were returned.</p>
              )}
            </SectionCard>
          </>
        )}
      </div>
    </Page>
  );
}

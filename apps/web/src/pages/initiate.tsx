import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Gauge, Sparkles } from "lucide-react";
import { Button, Card, Progress } from "../components/ui";
import { DisabledOverlay, EmptyState, MetricCard, Page, PageHeader, SectionCard, MetricGridSkeleton, CardSkeleton } from "../components/app-ui";
import { api, waitForJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";

export function InitiatePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();

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

  const components = score?.components ?? [];
  const actions = components.flatMap((c: any) => (Array.isArray(c.actions) ? c.actions : []));

  return (
    <Page>
      <div className="flex flex-col gap-6 pointer-events-none select-none opacity-75">
        <PageHeader
          eyebrow="Initiate"
          tone="blue"
          title="Health Score readiness"
          description="A one-time, evidence-based readiness snapshot: is this project well-defined enough to build?"
          actions={
            <Button disabled={calculate.isPending} onClick={() => calculate.mutate()}>
              <Sparkles size={16} />
              {calculate.isPending ? "Calculating..." : score ? "Recalculate" : "Calculate Health Score"}
            </Button>
          }
        />

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
      <DisabledOverlay message="Admin has disabled Health Score calculations." />
    </Page>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, Gauge, RefreshCcw, Sparkles, Target } from "lucide-react";
import { Button, Card, Progress } from "../components/ui";
import { DisabledOverlay, EmptyState, MetricCard, Page, PageHeader, SectionCard, MetricGridSkeleton, CardSkeleton } from "../components/app-ui";
import { api, waitForJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";

export function InitiatePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();

  const { data: config } = useQuery<any>({ queryKey: ["viability-config"], queryFn: () => api("/viability/config") });

  const { data, isLoading } = useQuery({
    queryKey: ["viability", projectId],
    queryFn: () => api<any>(`/viability/projects/${projectId}/current`),
    enabled: Boolean(projectId),
  });

  const calculate = useMutation({
    mutationFn: async () => {
      const job = await api<{ id: string }>(`/viability/projects/${projectId}/calculate`, { method: "POST" });
      return waitForJob(job.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["viability", projectId] });
    },
  });

  const score = data?.overall ? data : null;
  const remaining = config?.recalculationLimit && data?.recalculationsUsed !== undefined
    ? Math.max(0, config.recalculationLimit - data.recalculationsUsed)
    : null;
  const components = Object.entries(score?.components ?? {});
  const actions = Array.isArray(score?.actions) ? score.actions : [];
  const canCalculate = config?.recalculationLimit ? (data?.recalculationsUsed ?? 0) < config.recalculationLimit : true;

  return (
    <Page>
      <div className="flex flex-col gap-6 pointer-events-none select-none opacity-75">
        <PageHeader
          eyebrow="Initiate"
          tone="blue"
          title="Viability readiness"
          description="Trace the current product evidence into a scored, explainable readiness snapshot."
          actions={
            <Button disabled={calculate.isPending || !canCalculate} onClick={() => calculate.mutate()}>
              <Sparkles size={16} />
              {calculate.isPending ? "Calculating..." : score ? "Recalculate" : "Calculate viability"}
            </Button>
          }
        />

        {calculate.error ? (
          <Card className="border-destructive/25 bg-destructive-soft/30 p-6">
            <h2 className="mb-2 text-base font-bold text-destructive">Calculation blocked</h2>
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
          <EmptyState title="No viability snapshot yet" description="Complete a connected Refine thread, then calculate the first Initiate score." />
        ) : (
          <>
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Overall viability" value={score.overall} detail={`Source version ${score.sourceVersion ?? "-"}`} icon={Gauge} tone="blue" />
              <MetricCard
                label="Recalculations"
                value={`${data?.recalculationsUsed ?? 0}/${config?.recalculationLimit ?? "-"}`}
                detail={`${remaining ?? "-"} remaining`}
                icon={RefreshCcw}
              />
              {components.slice(0, 2).map(([name, value]) => (
                <MetricCard
                  key={name}
                  label={name.replaceAll("_", " ")}
                  value={String(value)}
                  detail={`Weight ${config?.weights?.[name] ?? "-"}%`}
                  icon={Target}
                />
              ))}
            </section>

            {components.length > 2 ? (
              <SectionCard title="Component scores" description="The weighted signals behind the readiness snapshot">
                <div className="grid gap-4 md:grid-cols-2">
                  {components.map(([name, value]) => (
                    <div className="rounded-xl border border-border bg-secondary/35 p-4" key={name}>
                      <div className="mb-3 flex items-center justify-between gap-4 text-xs">
                        <strong className="capitalize">{name.replaceAll("_", " ")}</strong>
                        <span className="font-bold text-foreground">{String(value)}</span>
                      </div>
                      <Progress value={Number(value)} label={`${name} score`} />
                    </div>
                  ))}
                </div>
              </SectionCard>
            ) : null}

            <SectionCard title="Why this score" description="The rationale captured with this snapshot">
              <p className="m-0 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{score.rationale}</p>
            </SectionCard>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SectionCard title="Prioritized readiness actions" description="Next actions to improve the score">
                {actions.length ? (
                  <div className="grid gap-3">
                    {actions.map((action: any, index: number) => (
                      <div className="flex gap-3 rounded-xl border border-warning/15 bg-warning-soft/35 p-4" key={index}>
                        <Activity size={18} className="mt-0.5 shrink-0 text-warning" />
                        <span className="text-sm leading-6">{typeof action === "string" ? action : action.title ?? JSON.stringify(action)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="m-0 text-sm text-muted-foreground">No further actions were returned.</p>
                )}
              </SectionCard>

              <SectionCard title="Readiness criteria" description="Configured gates for entering delivery with confidence">
                <div className="grid gap-3">
                  {(config?.readinessCriteria ?? []).map((item: string) => (
                    <div className="flex gap-3 rounded-xl border border-border bg-card p-4" key={item}>
                      <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-primary" />
                      <span className="text-sm leading-6">{item}</span>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </>
        )}
      </div>
      <DisabledOverlay message="Admin has disabled viability calculations." />
    </Page>
  );
}

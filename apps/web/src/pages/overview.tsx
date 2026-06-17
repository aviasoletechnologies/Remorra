import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, CircleAlert, Gauge, ListChecks, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Card, Progress } from "../components/ui";
import { ActionLink, MetricCard, Page, PageHeader, SectionCard, PageSkeleton, MetricGridSkeleton, CardSkeleton } from "../components/app-ui";

export function OverviewPage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const { data, isLoading } = useQuery({
    queryKey: ["venture", projectId],
    queryFn: () => api<any>(`/projects/${projectId}/venture`),
    enabled: Boolean(projectId),
  });
  const { data: viability } = useQuery({
    queryKey: ["viability", projectId],
    queryFn: () => api<any>(`/viability/projects/${projectId}/current`),
    enabled: Boolean(projectId),
  });

  if (isLoading) {
    return (
      <PageSkeleton eyebrow={true} title={true} actionsCount={2}>
        <MetricGridSkeleton count={4} />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_.65fr]">
          <CardSkeleton rows={4} />
          <CardSkeleton rows={4} />
        </div>
      </PageSkeleton>
    );
  }

  const tasks = data?.tasks ?? [];
  const done = tasks.filter((task: any) => task.status === "done").length;
  const blockers = data?.raid?.filter((item: any) => item.status !== "closed") ?? [];
  const completion = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const score = viability?.overall ?? 0;
  const components = Object.entries(viability?.components ?? {}).slice(0, 3);

  return (
    <Page>
      <PageHeader
        eyebrow="Live product workspace"
        title="Your product intelligence"
        description="The evidence, decisions, and delivery movement that matter now, connected in one traceable view."
        actions={
          <>
            <ActionLink to="/reports" variant="outline">Generate report</ActionLink>
            <ActionLink to="/venture">Open delivery board</ActionLink>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Overall viability" value={viability?.overall ?? "Not scored"} detail="Evidence-based readiness" icon={Gauge} />
        <MetricCard label="Cycle completion" value={`${completion}%`} detail={`${done} of ${tasks.length} tasks complete`} icon={ListChecks} tone="blue" />
        <MetricCard label="Open risks" value={blockers.length} detail="Risks and dependencies needing review" icon={CircleAlert} tone="amber" />
        <MetricCard label="Delivery evidence" value={tasks.length} detail="Connected tasks in the workspace" icon={Activity} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <SectionCard
          title="Product viability"
          description={viability?.rationale ? "Current evidence-based assessment" : "Complete Discover and Refine to create the first score."}
          action={<Badge tone={viability ? "green" : "neutral"}>{viability ? "Current" : "Not calculated"}</Badge>}
        >
          <div className="grid gap-6 lg:grid-cols-[150px_1fr] lg:items-center">
            <div className="relative mx-auto grid size-32 place-items-center rounded-full" style={{ background: `conic-gradient(var(--color-primary) 0 ${score}%, var(--color-muted) ${score}% 100%)` }}>
              <div className="absolute inset-2 grid place-items-center rounded-full bg-card shadow-inner">
                <div className="text-center">
                  <strong className="block text-3xl tracking-[-.05em]">{viability?.overall ?? "—"}</strong>
                  <span className="text-[10px] font-semibold text-muted-foreground">out of 100</span>
                </div>
              </div>
            </div>
            <div>
              <p className="m-0 text-sm leading-6 text-muted-foreground">
                {viability?.rationale ?? "Remorra will explain the score and its source evidence after the first Initiate calculation."}
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {components.map(([label, value]) => (
                  <div key={label}>
                    <div className="mb-2 flex justify-between gap-3 text-[10px] font-bold uppercase tracking-[.08em] text-muted-foreground">
                      <span className="truncate">{label.replaceAll("_", " ")}</span>
                      <span className="text-foreground">{String(value)}</span>
                    </div>
                    <Progress value={Number(value)} label={`${label} score`} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Current cycle" description="Delivery progress and work still in motion">
          <div className="grid gap-5">
            <div>
              <div className="mb-2 flex items-end justify-between">
                <strong className="text-3xl tracking-[-.05em]">{completion}%</strong>
                <span className="text-xs text-muted-foreground">{tasks.length - done} open</span>
              </div>
              <Progress value={completion} label="Cycle completion" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-accent-soft/55 p-4">
                <CheckCircle2 size={17} className="mb-3 text-primary" />
                <strong className="block text-xl">{done}</strong>
                <span className="text-[11px] text-muted-foreground">Completed</span>
              </div>
              <div className="rounded-xl bg-warning-soft/65 p-4">
                <CircleAlert size={17} className="mb-3 text-warning" />
                <strong className="block text-xl">{blockers.length}</strong>
                <span className="text-[11px] text-muted-foreground">Needs attention</span>
              </div>
            </div>
          </div>
        </SectionCard>
      </section>

      <Card className="grid gap-4 border-primary/15 bg-accent-soft/45 p-5 shadow-none sm:grid-cols-[44px_1fr_auto] sm:items-center">
        <div className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles size={19} /></div>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[.1em] text-primary">Remorra intelligence</span>
          <h2 className="mb-1 mt-1 text-sm font-bold">{viability?.actions?.[0]?.title ?? "Build evidence before expanding scope."}</h2>
          <p className="m-0 text-xs leading-5 text-muted-foreground">Recommendations remain grounded in confirmed records and subject to founder approval.</p>
        </div>
        <ActionLink to="/initiate" variant="outline">Review actions</ActionLink>
      </Card>
    </Page>
  );
}

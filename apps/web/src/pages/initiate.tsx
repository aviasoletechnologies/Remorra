import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, CheckCircle2, Sparkles } from "lucide-react";
import { Badge, Button, Card } from "../components/ui";
import { api, waitForJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";

export function InitiatePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
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
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const score = data && "snapshot" in data ? data.snapshot : data;
  const config = data?.config;
  const components = score?.components && typeof score.components === "object"
    ? Object.entries(score.components)
    : [];
  const actions = Array.isArray(score?.actions) ? score.actions : [];
  const remaining = data?.recalculationsRemaining;
  const canCalculate = remaining === undefined || remaining > 0 || !score;

  return <div className="page-container py-8 px-6 max-w-[1440px] mx-auto flex flex-col gap-6">
    <section className="flex flex-col md:flex-row md:items-end justify-between gap-4"><div><Badge tone="blue">Initiate</Badge><h1 className="text-3xl font-bold tracking-tight text-ink mt-3 mb-1">Viability readiness</h1><p className="text-sm text-muted">Trace the current product evidence into a scored, explainable readiness snapshot.</p></div><Button disabled={calculate.isPending || !canCalculate} onClick={() => calculate.mutate()} className="h-10 px-5 gap-2"><Sparkles size={16} />{calculate.isPending ? "Calculating..." : score ? "Recalculate" : "Calculate viability"}</Button></section>
    {calculate.error ? <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed border-red/30 bg-red-soft/10"><h2 className="text-xl font-bold text-red mb-2">Calculation blocked</h2><p className="text-sm text-red/80 max-w-lg">{calculate.error.message}</p></Card> : null}
    {isLoading ? <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-sm font-medium text-muted"><Activity className="animate-pulse text-accent" size={32} />Loading score...</div> : !score ? <Card className="p-16 flex flex-col items-center justify-center text-center border-dashed"><div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4"><Activity size={24} className="text-accent" /></div><h2 className="text-xl font-bold text-ink mb-2">No viability snapshot yet</h2><p className="text-sm text-muted max-w-md leading-relaxed">Complete a connected Refine thread, then calculate the first Initiate score.</p></Card> : <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-5"><Card className="p-6 flex flex-col justify-between items-start gap-4"><span className="text-xs font-bold text-muted uppercase tracking-wider">Overall viability</span><strong className="text-4xl font-black text-ink">{score.overall}</strong><small className="text-xs text-muted">Source project version {score.sourceVersion}</small></Card><Card className="p-6 flex flex-col justify-between items-start gap-4"><span className="text-xs font-bold text-muted uppercase tracking-wider">Recalculations</span><strong className="text-3xl font-bold text-ink">{data?.recalculationsUsed ?? 0}/{config?.recalculationLimit ?? "-"}</strong><small className="text-xs text-muted">{remaining ?? "-"} remaining</small></Card>{components.map(([name, value]) => <Card className="p-6 flex flex-col justify-between items-start gap-4" key={name}><span className="text-xs font-bold text-muted uppercase tracking-wider">{name.replaceAll("_", " ")}</span><strong className="text-3xl font-bold text-ink">{String(value)}</strong><small className="text-xs text-muted">Weight {config?.weights?.[name] ?? "-"}%</small></Card>)}</div>
      <Card className="p-8 flex flex-col gap-4"><h2 className="text-lg font-bold text-ink">Why this score</h2><p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">{score.rationale}</p></Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-8 flex flex-col gap-5"><h2 className="text-lg font-bold text-ink">Prioritized readiness actions</h2>{actions.length ? <div className="flex flex-col gap-3">{actions.map((action: any, index: number) => <div className="flex gap-3 items-start p-3 rounded-lg bg-amber-soft/20 border border-amber/10" key={index}><CheckCircle2 size={18} className="text-amber mt-0.5 flex-shrink-0" /><span className="text-sm text-ink leading-relaxed">{typeof action === "string" ? action : action.title ?? JSON.stringify(action)}</span></div>)}</div> : <p className="text-sm text-muted">No further actions were returned.</p>}</Card>
        <Card className="p-8 flex flex-col gap-5"><h2 className="text-lg font-bold text-ink">Readiness criteria</h2><div className="flex flex-col gap-3">{(config?.readinessCriteria ?? []).map((item: string) => <div className="flex gap-3 items-start p-3 rounded-lg bg-surface border border-border-remorra" key={item}><CheckCircle2 size={18} className="text-green mt-0.5 flex-shrink-0" /><span className="text-sm text-ink leading-relaxed">{item}</span></div>)}</div></Card>
      </div>
    </>}
  </div>;
}

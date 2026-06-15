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

  return <div className="page">
    <section className="page-heading compact-heading"><div><Badge tone="blue">Initiate</Badge><h1>Viability readiness</h1><p>Trace the current product evidence into a scored, explainable readiness snapshot.</p></div><Button disabled={calculate.isPending || !canCalculate} onClick={() => calculate.mutate()}><Sparkles size={16} />{calculate.isPending ? "Calculating..." : score ? "Recalculate" : "Calculate viability"}</Button></section>
    {calculate.error ? <Card className="empty-state"><h2>Calculation blocked</h2><p>{calculate.error.message}</p></Card> : null}
    {isLoading ? <div className="loading-page">Loading score...</div> : !score ? <Card className="empty-state"><Activity size={24} /><h2>No viability snapshot yet</h2><p>Complete a connected Refine thread, then calculate the first Initiate score.</p></Card> : <>
      <div className="metrics-grid"><Card><span>Overall viability</span><strong>{score.overall}</strong><small>Source project version {score.sourceVersion}</small></Card><Card><span>Recalculations</span><strong>{data?.recalculationsUsed ?? 0}/{config?.recalculationLimit ?? "-"}</strong><small>{remaining ?? "-"} remaining</small></Card>{components.map(([name, value]) => <Card key={name}><span>{name.replaceAll("_", " ")}</span><strong>{String(value)}</strong><small>Weight {config?.weights?.[name] ?? "-"}%</small></Card>)}</div>
      <Card><h2>Why this score</h2><p>{score.rationale}</p></Card>
      <Card><h2>Prioritized readiness actions</h2>{actions.length ? <div className="stack-list">{actions.map((action: any, index: number) => <div className="list-row" key={index}><CheckCircle2 size={17} /><span>{typeof action === "string" ? action : action.title ?? JSON.stringify(action)}</span></div>)}</div> : <p>No further actions were returned.</p>}</Card>
      <Card><h2>Readiness criteria</h2><div className="stack-list">{(config?.readinessCriteria ?? []).map((item: string) => <div className="list-row" key={item}><CheckCircle2 size={17} /><span>{item}</span></div>)}</div></Card>
    </>}
  </div>;
}

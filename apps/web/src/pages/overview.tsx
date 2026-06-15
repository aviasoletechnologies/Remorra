import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, CircleAlert, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card, Progress } from "../components/ui";

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
  if (isLoading) return <div className="page loading-page">Loading product evidence…</div>;
  const tasks = data?.tasks ?? [];
  const done = tasks.filter((task: any) => task.status === "done").length;
  const blockers = data?.raid?.filter((item: any) => item.status !== "closed") ?? [];
  const completion = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="page">
      <section className="page-heading">
        <div><Badge tone="green">Live product workspace</Badge><h1>Your product intelligence</h1><p>Focus on the evidence, decisions, and delivery movement that matter now.</p></div>
        <div className="heading-actions"><Link to="/reports" className="button button--secondary">Generate report</Link><Link to="/venture" className="button button--primary">Open delivery board <ArrowRight size={16} /></Link></div>
      </section>
      <section className="metric-grid">
        <Card className="metric-card viability-card">
          <div className="metric-card__top"><span>Product viability</span><Badge tone="green">Evidence based</Badge></div>
          <div className="score-lockup"><div className="score-ring"><strong>{viability?.overall ?? "—"}</strong><span>/100</span></div><div><h3>{viability?.rationale ? "Current assessment" : "Not calculated yet"}</h3><p>{viability?.rationale ?? "Complete Discover and Refine to create the first score."}</p></div></div>
          <div className="score-bars">{Object.entries(viability?.components ?? {}).slice(0, 3).map(([label, value]) => <span key={label}>{label}<Progress value={Number(value)} label={`${label} score`} /><b>{String(value)}</b></span>)}</div>
        </Card>
        <Card className="metric-card"><div className="metric-card__top"><span>Cycle health</span></div><div className="large-metric">{completion}<span>%</span></div><p>{done} of {tasks.length} tasks completed</p><Progress value={completion} label="Cycle completion" /><div className="metric-footer"><span><CheckCircle2 size={15} />{done} done</span><span>{tasks.length - done} open</span></div></Card>
        <Card className="metric-card attention-card"><div className="metric-card__top"><span>Needs attention</span><Badge tone="amber">{blockers.length} items</Badge></div><div className="attention-number">{blockers.length}</div><h3>Open risks and dependencies</h3><p>Use Evolve when a delivery issue changes strategy or linked product intent.</p><Link to="/evolve">Work through it in Evolve <ArrowRight size={15} /></Link></Card>
      </section>
      <Card className="insight-banner">
        <div className="insight-icon"><Sparkles size={20} /></div>
        <div><span>Remorra intelligence</span><h3>{viability?.actions?.[0]?.title ?? "Build evidence before expanding scope."}</h3><p>Every recommendation is grounded in confirmed records and remains subject to founder approval.</p></div>
        <Button variant="secondary"><CircleAlert size={15} />Review actions</Button>
      </Card>
    </div>
  );
}

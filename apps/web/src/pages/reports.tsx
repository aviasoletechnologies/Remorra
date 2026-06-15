import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileChartColumn, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card } from "../components/ui";

export function ReportsPage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => api<any[]>("/projects") });
  const role = projects.find((project) => project.id === projectId)?.role;
  const isSupplier = role === "supplier";
  const { data: definitions = [] } = useQuery({ queryKey: ["report-definitions"], queryFn: () => api<any[]>("/report-definitions") });
  const { data: reports = [] } = useQuery({ queryKey: ["reports", projectId], queryFn: () => api<any[]>(`/projects/${projectId}/reports`), enabled: Boolean(projectId), refetchInterval: 5000 });
  const generate = useMutation({
    mutationFn: (reportType: string) => api(`/projects/${projectId}/reports`, { method: "POST", body: JSON.stringify({ reportType }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["reports", projectId] }),
  });
  async function download(documentId: string) {
    const result = await api<{ ready: boolean; url?: string }>(`/documents/${documentId}/download`);
    if (result.url) window.open(result.url, "_blank", "noopener");
  }
  return <div className="page"><section className="page-heading compact-heading"><div><Badge tone="blue">On demand</Badge><h1>Reports and product packs</h1><p>Generate immutable, traceable outputs from confirmed product and delivery evidence.</p></div></section>
    {!isSupplier ? <section className="report-grid">{definitions.map((definition) => <Card className="report-card" key={definition.id}><FileChartColumn size={21} /><h3>{definition.name}</h3><p>{definition.description}</p><Button onClick={() => generate.mutate(definition.id)} disabled={generate.isPending}>Generate report</Button></Card>)}</section> : <Card className="empty-state"><h2>Supplier Build Pack access</h2><p>Suppliers can download assigned Build Packs and view their assigned work, but report generation and AI actions stay with Founder and Team roles.</p></Card>}
    <Card className="report-history"><div className="section-title"><div><span>Generation history</span><h2>Recent outputs</h2></div></div>{reports.map((report) => <div className="report-row" key={report.id}><div><strong>{report.definition.name}</strong><small>{new Date(report.createdAt).toLocaleString()}</small></div><Badge tone={report.status === "completed" ? "green" : report.status === "failed" ? "red" : "amber"}>{report.status}</Badge>{report.document?.id ? <Button variant="secondary" onClick={() => void download(report.document.id)}><Download size={15} />Download</Button> : <RefreshCw size={16} />}</div>)}{reports.length === 0 && <div className="empty-state">No reports generated yet.</div>}</Card>
  </div>;
}

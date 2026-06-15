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
  return <div className="page-container py-8 px-6 max-w-[1440px] mx-auto flex flex-col gap-6">
    <section className="flex flex-col gap-2"><div><Badge tone="blue">On demand</Badge><h1 className="text-3xl font-bold tracking-tight text-ink mt-3 mb-1">Reports and product packs</h1><p className="text-sm text-muted">Generate immutable, traceable outputs from confirmed product and delivery evidence.</p></div></section>
    {!isSupplier ? <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">{definitions.map((definition) => <Card className="p-6 flex flex-col justify-between" key={definition.id}><div><div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center mb-4"><FileChartColumn size={20} className="text-accent" /></div><h3 className="font-bold text-ink mb-2">{definition.name}</h3><p className="text-xs text-muted leading-relaxed">{definition.description}</p></div><Button onClick={() => generate.mutate(definition.id)} disabled={generate.isPending} className="w-full mt-6 h-9 text-xs">Generate report</Button></Card>)}</section> : <Card className="p-12 flex flex-col items-center justify-center text-center border-dashed"><h2 className="text-xl font-bold text-ink mb-2">Supplier Build Pack access</h2><p className="text-sm text-muted max-w-lg">Suppliers can download assigned Build Packs and view their assigned work, but report generation and AI actions stay with Founder and Team roles.</p></Card>}
    <Card className="p-0 overflow-hidden"><div className="bg-surface-2 border-b border-border-remorra p-4 flex items-center justify-between"><div className="flex flex-col"><span className="text-[10px] uppercase tracking-wider text-muted font-bold">Generation history</span><h2 className="text-sm font-bold text-ink">Recent outputs</h2></div></div>
    <div className="flex flex-col divide-y divide-border-remorra/50">
    {reports.map((report) => <div className="p-4 flex items-center justify-between hover:bg-surface-2/50 transition-colors" key={report.id}><div className="flex flex-col"><strong className="text-sm font-bold text-ink">{report.definition.name}</strong><small className="text-xs text-muted mt-0.5">{new Date(report.createdAt).toLocaleString()}</small></div><Badge tone={report.status === "completed" ? "green" : report.status === "failed" ? "red" : "amber"}>{report.status}</Badge>{report.document?.id ? <Button variant="secondary" className="h-8 text-xs gap-1.5" onClick={() => void download(report.document.id)}><Download size={14} />Download</Button> : <RefreshCw size={14} className="animate-spin text-muted" />}</div>)}
    {reports.length === 0 && <div className="p-10 text-center text-sm text-muted">No reports generated yet.</div>}
    </div></Card>
  </div>;
}

import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, Download, Link2, Upload } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card, Progress } from "../components/ui";

export function KnowledgePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const [importJson, setImportJson] = useState("");
  const { data: pack } = useQuery({
    queryKey: ["product-pack", projectId],
    queryFn: () => api<any>(`/projects/${projectId}/product-pack`),
    enabled: Boolean(projectId),
  });
  const developerImport = useMutation({
    mutationFn: () => api<{ sessionId: string; impactsCreated: number }>(`/projects/${projectId}/developer-import`, {
      method: "POST",
      body: importJson,
    }),
  });
  async function developerExport() {
    if (!projectId) return;
    const result = await api<Record<string, unknown>>(`/projects/${projectId}/developer-export`);
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `remorra-developer-change-pack-${projectId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  const content = pack?.content ?? {};
  return <div className="page"><section className="page-heading compact-heading"><div><Badge tone="blue">Confirmed records</Badge><h1>Product library</h1><p>The source of truth assembled from founder-approved product entities.</p></div></section>
    <Card className="library-summary"><Link2 size={21} /><div><strong>{pack?.coveragePercent ?? 0}% linkage coverage</strong><span>{pack?.linkageValid ? "Initiate pass criteria met" : "A complete Ambition-to-User-Need thread is still required"}</span></div><Progress value={pack?.coveragePercent ?? 0} label="Linkage coverage" /></Card>
    <Card className="library-card">
      <div className="section-title"><div><span>Developer handoff</span><h2>Change pack export and import</h2></div><Button variant="secondary" onClick={() => void developerExport()}><Download size={15} />Export</Button></div>
      <p>Export confirmed product and delivery evidence for implementation, then import proposed changes into a locked Evolve publish session for founder review.</p>
      <textarea className="full-textarea" placeholder='Paste {"changes":[{"type":"task","title":"...","action":"create"}]}' value={importJson} onChange={(event) => setImportJson(event.target.value)} />
      <Button disabled={!importJson.trim() || developerImport.isPending} onClick={() => developerImport.mutate()}><Upload size={15} />Import for Evolve review</Button>
      {developerImport.data ? <small>Created Evolve session {developerImport.data.sessionId.slice(0, 8)} with {developerImport.data.impactsCreated} impact items.</small> : null}
      {developerImport.error ? <small className="error-text">{developerImport.error.message}</small> : null}
    </Card>
    <section className="library-grid">{Object.entries(content).map(([key, value]) => <Card className="library-card" key={key}><BookOpen size={18} /><h3>{key.replaceAll("_", " ")}</h3><pre>{JSON.stringify(value, null, 2)}</pre></Card>)}{Object.keys(content).length === 0 && <Card className="library-card"><h3>No confirmed Product Pack yet</h3><p>Complete Refine proposals to populate this library.</p></Card>}</section>
  </div>;
}

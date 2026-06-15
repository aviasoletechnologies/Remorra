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
      <textarea className="full-textarea" placeholder='Paste {"changes":[{"operation":"create","entityType":"task","data":{"title":"..."}}]}' value={importJson} onChange={(event) => setImportJson(event.target.value)} />
      
      {(() => {
        if (!importJson.trim()) return null;
        try {
          const parsed = JSON.parse(importJson);
          const changes = Array.isArray(parsed?.changes)
            ? parsed.changes
            : Array.isArray(parsed?.impacts)
              ? parsed.impacts
              : Array.isArray(parsed)
                ? parsed
                : [];
          if (changes.length === 0) {
            return <div className="error-text" style={{ fontSize: "11px", marginTop: "5px", color: "orange" }}>No changes array detected in JSON.</div>;
          }
          return (
            <div className="import-preview" style={{ marginTop: "12px", marginBottom: "12px", background: "#f9f9f9", padding: "12px", borderRadius: "8px", border: "1px solid #eee" }}>
              <h4 style={{ margin: "0 0 8px 0", fontSize: "12px" }}>Changes Preview ({changes.length} items)</h4>
              <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #ddd" }}>
                      <th style={{ padding: "6px 4px" }}>Operation</th>
                      <th style={{ padding: "6px 4px" }}>Type</th>
                      <th style={{ padding: "6px 4px" }}>Reason / Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.map((ch: any, idx: number) => {
                      const op = String(ch.operation ?? ch.action ?? "update");
                      return (
                        <tr key={idx} style={{ borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "6px 4px", fontWeight: "bold", color: op === "delete" ? "red" : op === "create" ? "green" : "blue" }}>{op}</td>
                          <td style={{ padding: "6px 4px" }}>{ch.entityType || "task"}</td>
                          <td style={{ padding: "6px 4px", color: "#666" }}>{ch.reason || ch.reasoning || ch.title || "Imported change"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        } catch (err: any) {
          return <div className="error-text" style={{ fontSize: "11px", marginTop: "5px", color: "red" }}>Invalid JSON format.</div>;
        }
      })()}

      <Button disabled={!importJson.trim() || (() => {
        try {
          const p = JSON.parse(importJson);
          return !(Array.isArray(p?.changes) || Array.isArray(p?.impacts) || Array.isArray(p));
        } catch {
          return true;
        }
      })() || developerImport.isPending} onClick={() => developerImport.mutate()}><Upload size={15} />Import for Evolve review</Button>
      {developerImport.data ? <small>Created Evolve session {developerImport.data.sessionId.slice(0, 8)} with {developerImport.data.impactsCreated} impact items.</small> : null}
      {developerImport.error ? <small className="error-text">{developerImport.error.message}</small> : null}
    </Card>
    <section className="library-grid">{Object.entries(content).map(([key, value]) => <Card className="library-card" key={key}><BookOpen size={18} /><h3>{key.replaceAll("_", " ")}</h3><pre>{JSON.stringify(value, null, 2)}</pre></Card>)}{Object.keys(content).length === 0 && <Card className="library-card"><h3>No confirmed Product Pack yet</h3><p>Complete Refine proposals to populate this library.</p></Card>}</section>
  </div>;
}

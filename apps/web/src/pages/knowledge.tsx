import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, Download, Link2, Upload } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card, Progress, Textarea } from "../components/ui";

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
  return <div className="page-container py-8 px-6 max-w-[1440px] mx-auto flex flex-col gap-6">
    <section className="flex flex-col gap-2"><div><Badge tone="blue">Confirmed records</Badge><h1 className="text-3xl font-bold tracking-tight text-ink mt-3 mb-1">Product library</h1><p className="text-sm text-muted">The source of truth assembled from founder-approved product entities.</p></div></section>
    
    <Card className="p-6 flex flex-col gap-4 bg-surface border-border-remorra/70 shadow-sm"><div className="flex items-center gap-4"><div className="w-10 h-10 rounded-lg bg-blue-soft/30 flex items-center justify-center"><Link2 size={20} className="text-blue" /></div><div className="flex flex-col"><strong className="text-sm font-bold text-ink">{pack?.coveragePercent ?? 0}% linkage coverage</strong><span className="text-xs text-muted">{pack?.linkageValid ? "Initiate pass criteria met" : "A complete Ambition-to-User-Need thread is still required"}</span></div></div><Progress value={pack?.coveragePercent ?? 0} label="Linkage coverage" className="h-2 rounded-full" /></Card>
    
    <Card className="p-8 flex flex-col gap-6 bg-surface border-border-remorra/70 shadow-sm">
      <div className="flex justify-between items-start">
        <div className="flex flex-col gap-1"><span className="text-xs font-bold uppercase tracking-wider text-muted">Developer handoff</span><h2 className="text-xl font-bold text-ink">Change pack export and import</h2></div>
        <Button variant="secondary" onClick={() => void developerExport()} className="h-9 gap-1.5 px-4"><Download size={14} />Export</Button>
      </div>
      <p className="text-sm text-muted leading-relaxed max-w-2xl">Export confirmed product and delivery evidence for implementation, then import proposed changes into a locked Evolve publish session for founder review.</p>
      
      <Textarea className="min-h-[140px] font-mono text-[11px] p-4 bg-surface-2 border-border-remorra rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/20" placeholder='Paste {"changes":[{"operation":"create","entityType":"task","data":{"title":"..."}}]}' value={importJson} onChange={(event) => setImportJson(event.target.value)} />
      
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
            return <div className="text-[11px] text-amber font-medium mt-1">No changes array detected in JSON.</div>;
          }
          return (
            <div className="mt-1 bg-surface-2 p-4 rounded-xl border border-border-remorra/50 max-h-[240px] overflow-y-auto">
              <h4 className="text-xs font-bold text-ink mb-3 tracking-wide uppercase">Changes Preview ({changes.length} items)</h4>
              <table className="w-full text-[11px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-border-remorra/40">
                    <th className="py-2 px-1 font-semibold text-muted">Operation</th>
                    <th className="py-2 px-1 font-semibold text-muted">Type</th>
                    <th className="py-2 px-1 font-semibold text-muted">Reason / Title</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((ch: any, idx: number) => {
                    const op = String(ch.operation ?? ch.action ?? "update");
                    const colorClass = op === "delete" ? "text-red" : op === "create" ? "text-green" : "text-blue";
                    return (
                      <tr key={idx} className="border-b border-border-remorra/20 last:border-0">
                        <td className={`py-2 px-1 font-bold ${colorClass}`}>{op}</td>
                        <td className="py-2 px-1 text-ink">{ch.entityType || "task"}</td>
                        <td className="py-2 px-1 text-muted max-w-[300px] truncate">{ch.reason || ch.reasoning || ch.title || "Imported change"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        } catch (err: any) {
          return <div className="text-[11px] text-red font-medium mt-1">Invalid JSON format.</div>;
        }
      })()}

      <div className="flex flex-col gap-2 items-start mt-2">
        <Button className="h-10 px-5 gap-2" disabled={!importJson.trim() || (() => {
          try {
            const p = JSON.parse(importJson);
            return !(Array.isArray(p?.changes) || Array.isArray(p?.impacts) || Array.isArray(p));
          } catch {
            return true;
          }
        })() || developerImport.isPending} onClick={() => developerImport.mutate()}><Upload size={15} />Import for Evolve review</Button>
        {developerImport.data ? <small className="text-[11px] text-green font-medium">Created Evolve session {developerImport.data.sessionId.slice(0, 8)} with {developerImport.data.impactsCreated} impact items.</small> : null}
        {developerImport.error ? <small className="text-[11px] text-red font-medium">{developerImport.error.message}</small> : null}
      </div>
    </Card>
    
    <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {Object.entries(content).map(([key, value]) => (
        <Card className="p-6 flex flex-col gap-4 bg-surface border-border-remorra/70 shadow-sm overflow-hidden" key={key}>
          <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-md bg-accent-soft/30 flex items-center justify-center"><BookOpen size={16} className="text-accent" /></div><h3 className="text-sm font-bold text-ink capitalize">{key.replaceAll("_", " ")}</h3></div>
          <pre className="text-[10px] bg-surface-2 p-3 rounded-lg border border-border-remorra/40 text-muted overflow-auto max-h-[300px]">{JSON.stringify(value, null, 2)}</pre>
        </Card>
      ))}
      {Object.keys(content).length === 0 && (
        <Card className="p-8 flex flex-col items-center text-center gap-2 border-dashed border-border-remorra/60 col-span-full">
          <div className="w-10 h-10 rounded-full bg-accent-soft/30 flex items-center justify-center mb-2"><BookOpen size={18} className="text-accent" /></div>
          <h3 className="text-base font-bold text-ink">No confirmed Product Pack yet</h3>
          <p className="text-xs text-muted max-w-sm leading-relaxed">Complete Refine proposals to populate this library.</p>
        </Card>
      )}
    </section>
  </div>;
}

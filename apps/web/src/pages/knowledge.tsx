import { useMutation, useQuery } from "@tanstack/react-query";
import { BookOpen, Download, FileJson, Link2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card, Progress, Textarea } from "../components/ui";
import { EmptyState, Page, PageHeader, SectionCard } from "../components/app-ui";

export function KnowledgePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const [importJson, setImportJson] = useState("");
  const { data: pack } = useQuery({
    queryKey: ["product-pack", projectId],
    queryFn: () => api<any>(`/projects/${projectId}/product-pack`),
    enabled: Boolean(projectId),
  });
  const developerImport = useMutation({
    mutationFn: () =>
      api<{ sessionId: string; impactsCreated: number }>(`/projects/${projectId}/developer-import`, {
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
  const entries = Object.entries(content);
  const parsedImport = useMemo(() => {
    if (!importJson.trim()) return { valid: false, changes: [] as any[], message: "" };
    try {
      const parsed = JSON.parse(importJson);
      const changes = Array.isArray(parsed?.changes)
        ? parsed.changes
        : Array.isArray(parsed?.impacts)
          ? parsed.impacts
          : Array.isArray(parsed)
            ? parsed
            : [];
      return {
        valid: changes.length > 0,
        changes,
        message: changes.length > 0 ? "" : "No changes array detected in JSON.",
      };
    } catch {
      return { valid: false, changes: [] as any[], message: "Invalid JSON format." };
    }
  }, [importJson]);

  return (
    <Page>
      <PageHeader
        eyebrow="Confirmed records"
        tone="blue"
        title="Product library"
        description="Founder-approved product truth, linkage coverage, and developer handoff assets."
      />

      <Card className="grid gap-5 p-5 lg:grid-cols-[1fr_260px] lg:items-center">
        <div className="flex items-start gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
            <Link2 size={20} />
          </div>
          <div className="min-w-0">
            <h2 className="m-0 text-base font-bold">Product Pack coverage</h2>
            <p className="mb-0 mt-1 text-sm leading-6 text-muted-foreground">
              {pack?.linkageValid ? "Initiate pass criteria met." : "A complete Goal-to-Story thread is still required."}
            </p>
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-end justify-between">
            <strong className="text-2xl tracking-[-.04em]">{pack?.coveragePercent ?? 0}%</strong>
            <Badge tone={pack?.linkageValid ? "green" : "amber"}>{pack?.linkageValid ? "Linked" : "Needs linkage"}</Badge>
          </div>
          <Progress value={pack?.coveragePercent ?? 0} label="Linkage coverage" />
        </div>
      </Card>

      <SectionCard
        title="Developer handoff"
        description="Export confirmed evidence, then import proposed implementation changes into Evolve review."
        action={<Button variant="outline" onClick={() => void developerExport()}><Download size={14} /> Export</Button>}
      >
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-3">
            <Textarea
              className="min-h-[180px] font-mono text-xs"
              placeholder='Paste {"changes":[{"operation":"create","entityType":"task","data":{"title":"..."}}]}'
              value={importJson}
              onChange={(event) => setImportJson(event.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button disabled={!parsedImport.valid || developerImport.isPending} onClick={() => developerImport.mutate()}>
                <Upload size={15} /> {developerImport.isPending ? "Importing..." : "Import for Evolve review"}
              </Button>
              {parsedImport.message ? <span className="text-xs font-semibold text-warning">{parsedImport.message}</span> : null}
              {developerImport.error ? <span className="form-message">{developerImport.error.message}</span> : null}
            </div>
            {developerImport.data ? (
              <p className="m-0 text-xs font-semibold text-primary">
                Created Evolve session {developerImport.data.sessionId.slice(0, 8)} with {developerImport.data.impactsCreated} impact items.
              </p>
            ) : null}
          </div>

          <div className="rounded-2xl border border-border bg-secondary/35 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="m-0 text-sm font-bold">Import preview</h3>
              <Badge tone={parsedImport.valid ? "green" : "neutral"}>{parsedImport.changes.length} changes</Badge>
            </div>
            {parsedImport.changes.length ? (
              <div className="grid max-h-[280px] gap-2 overflow-y-auto">
                {parsedImport.changes.map((change: any, index: number) => {
                  const op = String(change.operation ?? change.action ?? "update");
                  const tone = op === "delete" ? "red" : op === "create" ? "green" : "blue";
                  return (
                    <div className="rounded-xl border border-border bg-card p-3" key={index}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <Badge tone={tone as any}>{op}</Badge>
                        <span className="truncate text-xs font-semibold text-muted-foreground">{change.entityType || "task"}</span>
                      </div>
                      <p className="m-0 line-clamp-2 text-xs leading-5">{change.reason || change.reasoning || change.title || "Imported change"}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-40 place-items-center text-center text-xs leading-5 text-muted-foreground">
                Paste a valid change pack to preview operations before import.
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {entries.length ? (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entries.map(([key, value]) => (
            <Card className="overflow-hidden p-0" key={key}>
              <div className="flex items-center gap-3 border-b border-border bg-secondary/55 p-4">
                <div className="grid size-9 place-items-center rounded-lg bg-accent-soft text-primary">
                  <BookOpen size={16} />
                </div>
                <h3 className="m-0 text-sm font-bold capitalize">{key.replaceAll("_", " ")}</h3>
              </div>
              <pre className="m-0 max-h-[320px] overflow-auto bg-card p-4 text-xs leading-5 text-muted-foreground">{JSON.stringify(value, null, 2)}</pre>
            </Card>
          ))}
        </section>
      ) : (
        <EmptyState
          title="No confirmed Product Pack yet"
          description="Complete Refine proposals to populate this library."
          action={<div className="grid size-10 place-items-center rounded-xl bg-accent-soft text-primary"><FileJson size={18} /></div>}
        />
      )}
    </Page>
  );
}

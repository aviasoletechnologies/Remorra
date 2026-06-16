import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileChartColumn, LoaderCircle, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card } from "../components/ui";
import { EmptyState, Page, PageHeader, PermissionState, SectionCard } from "../components/app-ui";

export function ReportsPage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
  const { data: projects = [] } = useQuery({ queryKey: ["projects"], queryFn: () => api<any[]>("/projects") });
  const role = projects.find((project) => project.id === projectId)?.role;
  const isSupplier = role === "supplier";
  const { data: definitions = [] } = useQuery({ queryKey: ["report-definitions"], queryFn: () => api<any[]>("/report-definitions") });
  const { data: reports = [] } = useQuery({
    queryKey: ["reports", projectId],
    queryFn: () => api<any[]>(`/projects/${projectId}/reports`),
    enabled: Boolean(projectId),
    refetchInterval: 5000,
  });
  const generate = useMutation({
    mutationFn: (reportType: string) => api(`/projects/${projectId}/reports`, { method: "POST", body: JSON.stringify({ reportType }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["reports", projectId] }),
  });

  async function download(documentId: string) {
    const result = await api<{ ready: boolean; url?: string }>(`/documents/${documentId}/download`);
    if (result.url) window.open(result.url, "_blank", "noopener");
  }

  return (
    <Page>
      <PageHeader
        eyebrow="On demand"
        tone="blue"
        title="Reports and product packs"
        description="Generate immutable, traceable outputs from confirmed product and delivery evidence."
      />

      {isSupplier ? (
        <PermissionState description="Suppliers can download assigned Build Packs and view assigned work. Report generation and AI actions remain with Founder and Team roles." />
      ) : (
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {definitions.map((definition) => (
            <Card className="group p-5" key={definition.id}>
              <div className="grid size-10 place-items-center rounded-xl bg-info-soft text-info"><FileChartColumn size={19} /></div>
              <h2 className="mt-1 text-base font-bold">{definition.name}</h2>
              <p className="min-h-12 text-xs leading-5 text-muted-foreground">{definition.description}</p>
              <Button className="mt-auto w-full" disabled={generate.isPending} onClick={() => generate.mutate(definition.id)}>
                <Sparkles size={14} /> Generate report
              </Button>
            </Card>
          ))}
        </section>
      )}

      <SectionCard title="Recent outputs" description="Generation history, status, expiry, and downloads">
        {reports.length ? (
          <div className="-m-5 divide-y divide-border">
            {reports.map((report) => (
              <div className="grid gap-3 p-4 transition-colors hover:bg-secondary/45 sm:grid-cols-[1fr_auto_auto] sm:items-center" key={report.id}>
                <div>
                  <strong className="block text-sm">{report.definition.name}</strong>
                  <small className="mt-1 block text-xs text-muted-foreground">{new Date(report.createdAt).toLocaleString()}</small>
                </div>
                <Badge tone={report.status === "completed" ? "green" : report.status === "failed" ? "red" : "amber"}>{report.status}</Badge>
                {report.document?.id ? (
                  <Button variant="outline" size="sm" onClick={() => void download(report.document.id)}><Download size={14} /> Download</Button>
                ) : (
                  <span className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle size={14} className="animate-spin" /> Preparing</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No reports generated yet" description="Choose a report definition above to create the first immutable output." />
        )}
      </SectionCard>
    </Page>
  );
}

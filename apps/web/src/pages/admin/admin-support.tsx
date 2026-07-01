import { useState } from "react";
import { Inbox, Copy, Check, Mail, TrendingUp, Hash, Users } from "lucide-react";
import { Badge, Button, Card } from "../../components/ui";
import { DataTable, DetailDialog, MetricGridSkeleton, CardSkeleton, RichTableSkeleton, TableSkeleton } from "../../components/app-ui";
import { AdminAuditTable, AdminJsonPreview, AdminShellSection } from "../../components/admin-ui";

export function AdminSupport({
  projects,
  selectedProjectId,
  projectDetails,
  loading,
  onSelectProject,
  onCloseProject,
  page,
  totalPages,
  setPage,
  isLoading,
}: {
  projects: any[];
  selectedProjectId: string | null;
  projectDetails: any;
  loading: boolean;
  onSelectProject: (id: string) => void;
  onCloseProject: () => void;
  page: number;
  totalPages: number;
  setPage: (updater: (page: number) => number) => void;
  isLoading?: boolean;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <AdminShellSection
      title="Support workspace"
      description="Redaction-safe project diagnostics for support and platform admins."
    >
      <Card className="flow-builder">
        <div className="flow-builder__header flex justify-between items-center mb-6">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Users className="text-emerald-500" size={20} />
              Projects
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Select a project to inspect redacted diagnostics.
            </p>
          </div>
        </div>
        {isLoading ? (
          <TableSkeleton rows={8} columns={4} />
        ) : (
          <DataTable
            rows={projects}
            getRowKey={(row: any) => row.id}
            minWidth={640}
            onRowClick={(row: any) => onSelectProject(row.id)}
            emptyTitle="No projects"
            emptyDescription="No support-visible projects are available."
            columns={[
              {
                key: "name",
                header: "Name",
                cell: (row: any) => (
                  <div className="flex items-center gap-2">
                    <strong>{row.name}</strong>
                    {row.isSupportRisk ? <Badge tone="red">At risk</Badge> : null}
                  </div>
                ),
              },
              { key: "owner", header: "Owner", cell: (row: any) => <small className="text-muted-foreground">{row.ownerEmail}</small> },
              {
                key: "health",
                header: "Health",
                cell: (row: any) =>
                  row.latestHealthScore !== null ? (
                    <Badge tone={row.latestHealthScore >= 70 ? "green" : row.latestHealthScore >= 50 ? "amber" : "red"}>
                      {row.latestHealthScore}
                    </Badge>
                  ) : "-",
              },
              {
                key: "action",
                header: "",
                className: "text-right",
                cell: (row: any) => (
                  <Button variant={selectedProjectId === row.id ? "default" : "secondary"} size="sm" onClick={() => onSelectProject(row.id)}>
                    Inspect
                  </Button>
                ),
              },
            ]}
          />
        )}

        {!isLoading && (
          <div className="pagination-controls">
            <Button variant="secondary" onClick={() => setPage((prev) => Math.max(prev - 1, 1))} disabled={page <= 1}>
              Previous
            </Button>
            <span className="pagination-info">Page {page} of {totalPages}</span>
            <Button variant="secondary" onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))} disabled={page >= totalPages}>
              Next
            </Button>
          </div>
        )}
      </Card>

      <DetailDialog
        open={Boolean(selectedProjectId)}
        onOpenChange={(open) => { if (!open) onCloseProject(); }}
        title={`Diagnostic console: ${projectDetails?.name ?? "Loading..."}`}
        description="Support data is redacted and scoped to the selected project."
      >
        {loading ? (
          <div className="flex flex-col gap-6">
            <MetricGridSkeleton count={3} />
            <div className="grid gap-3">
              <CardSkeleton rows={3} />
              <CardSkeleton rows={4} />
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Project ID Card */}
              <div className="flex flex-col justify-between p-4 rounded-xl border border-border bg-card shadow-sm hover:border-primary/50 transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Project ID</span>
                  <Hash size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 z-10">
                  <code className="text-xs font-mono font-medium truncate text-foreground select-all" title={projectDetails?.id}>
                    {projectDetails?.id ? `${projectDetails.id.slice(0, 8)}...${projectDetails.id.slice(-8)}` : "-"}
                  </code>
                  {projectDetails?.id && (
                    <button
                      onClick={() => handleCopy(projectDetails.id, "projectId")}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      title="Copy Project ID"
                    >
                      {copiedId === "projectId" ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Owner Card */}
              <div className="flex flex-col justify-between p-4 rounded-xl border border-border bg-card shadow-sm hover:border-primary/50 transition-all group relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Owner</span>
                  <Mail size={16} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div className="flex items-center justify-between gap-2 mt-1 min-w-0 z-10">
                  <span className="text-xs font-medium truncate text-foreground block" title={projectDetails?.ownerEmail}>
                    {projectDetails?.ownerEmail ?? "-"}
                  </span>
                  {projectDetails?.ownerEmail && (
                    <button
                      onClick={() => handleCopy(projectDetails.ownerEmail, "ownerEmail")}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex-shrink-0"
                      title="Copy Owner Email"
                    >
                      {copiedId === "ownerEmail" ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                  )}
                </div>
              </div>

              {/* Usage Spike Card */}
              <div className={`flex flex-col justify-between p-4 rounded-xl border shadow-sm transition-all group relative overflow-hidden ${
                (projectDetails?.usageSpikePercent ?? 0) > 50 
                  ? "border-destructive/30 bg-destructive-soft/10 hover:border-destructive/50" 
                  : "border-border bg-card hover:border-primary/50"
              }`}>
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -mr-8 -mt-8 pointer-events-none" />
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">Usage Spike</span>
                  <TrendingUp size={16} className={(projectDetails?.usageSpikePercent ?? 0) > 50 ? "text-destructive" : "text-muted-foreground group-hover:text-primary transition-colors"} />
                </div>
                <div className="flex items-end justify-between mt-1 z-10">
                  <div className="flex flex-col">
                    <span className={`text-base font-bold tracking-tight ${
                      (projectDetails?.usageSpikePercent ?? 0) > 50 ? "text-destructive" : "text-foreground"
                    }`}>
                      {projectDetails?.usageSpikePercent ?? 0}%
                    </span>
                  </div>
                  <Badge tone={(projectDetails?.usageSpikePercent ?? 0) > 50 ? "red" : "neutral"}>
                    {(projectDetails?.usageSpikePercent ?? 0) > 50 ? "High Risk" : "Normal"}
                  </Badge>
                </div>
              </div>
            </div>

            <section className="grid gap-3">
              <h3>Team membership roles</h3>
              {(projectDetails?.members ?? []).length ? (
                <div className="grid gap-2">
                  {projectDetails.members.map((member: any) => (
                    <div className="key-value-row" key={member.userId}>
                      <span>{member.name || member.email}</span>
                      <Badge tone="blue">{member.role}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="table-empty-state table-empty-state-compact"><Inbox size={15} /><span>No team members on this project.</span></div>
              )}
            </section>

            <section className="grid gap-3">
              <h3>Redacted diagnostic audit log</h3>
              <AdminAuditTable
                rows={projectDetails?.recentAudits ?? []}
                getRowKey={(row: any) => row.id}
                compactEmpty
                columns={[
                  { key: "event", header: "Event type", cell: (row: any) => <strong>{row.eventType}</strong> },
                  { key: "entity", header: "Entity", cell: (row: any) => row.entityType || "-" },
                  { key: "created", header: "Created", cell: (row: any) => <small>{new Date(row.createdAt).toLocaleString()}</small> },
                  { key: "metadata", header: "Metadata", cell: (row: any) => <AdminJsonPreview value={row.metadata} title="Metadata" /> },
                ]}
              />
            </section>

            <section className="grid gap-3">
              <h3>Redacted project jobs</h3>
              <DataTable
                rows={projectDetails?.recentJobs ?? []}
                getRowKey={(row: any) => row.id}
                minWidth={760}
                compactEmpty
                emptyTitle="No project jobs"
                emptyDescription="No recent project jobs are available."
                columns={[
                  { key: "queue", header: "Queue", cell: (row: any) => <strong>{row.queue}</strong> },
                  { key: "status", header: "Status", cell: (row: any) => <Badge tone={row.status === "completed" ? "green" : row.status === "failed" ? "red" : "amber"}>{row.status}</Badge> },
                  { key: "attempts", header: "Attempts", cell: (row: any) => row.attempts },
                  { key: "payload", header: "Payload / result", cell: (row: any) => <AdminJsonPreview value={`${row.payload} / ${row.result}`} title="Result" /> },
                ]}
              />
            </section>
          </>
        )}
      </DetailDialog>
    </AdminShellSection>
  );
}

import { Inbox } from "lucide-react";
import { Badge, Button } from "../../components/ui";
import { DataTable, DetailDialog, KeyValueList, LoadingState, TableToolbar } from "../../components/app-ui";
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
}) {
  return (
    <AdminShellSection
      title="Support workspace"
      description="Redaction-safe project diagnostics for support and platform admins."
    >
      <TableToolbar title="Projects" description="Select a project to inspect redacted diagnostics." />
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
              row.latestViabilityScore !== null ? (
                <Badge tone={row.latestViabilityScore >= 70 ? "green" : row.latestViabilityScore >= 50 ? "amber" : "red"}>
                  {row.latestViabilityScore}
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

      <div className="pagination-controls">
        <Button variant="secondary" onClick={() => setPage((prev) => Math.max(prev - 1, 1))} disabled={page <= 1}>
          Previous
        </Button>
        <span className="pagination-info">Page {page} of {totalPages}</span>
        <Button variant="secondary" onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))} disabled={page >= totalPages}>
          Next
        </Button>
      </div>

      <DetailDialog
        open={Boolean(selectedProjectId)}
        onOpenChange={(open) => { if (!open) onCloseProject(); }}
        title={`Diagnostic console: ${projectDetails?.name ?? "Loading..."}`}
        description="Support data is redacted and scoped to the selected project."
      >
        {loading ? (
          <LoadingState label="Loading project diagnostics..." />
        ) : (
          <>
            <KeyValueList
              items={[
                { label: "Project ID", value: projectDetails?.id ?? "-" },
                { label: "Owner", value: projectDetails?.ownerEmail ?? "-" },
                {
                  label: "Usage spike",
                  value: `${projectDetails?.usageSpikePercent ?? 0}%`,
                  tone: (projectDetails?.usageSpikePercent ?? 0) > 50 ? "red" : "neutral",
                },
              ]}
            />

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

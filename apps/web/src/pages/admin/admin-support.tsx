import { X } from "lucide-react";
import { Badge, Button } from "../../components/ui";
import { DataTable, KeyValueList, LoadingState, TableToolbar } from "../../components/app-ui";
import { AdminAuditTable, AdminJsonPreview, AdminMasterDetail, AdminShellSection } from "../../components/admin-ui";

export function AdminSupport({
  projects,
  selectedProjectId,
  projectDetails,
  loading,
  onSelectProject,
  onCloseProject,
}: {
  projects: any[];
  selectedProjectId: string | null;
  projectDetails: any;
  loading: boolean;
  onSelectProject: (id: string) => void;
  onCloseProject: () => void;
}) {
  return (
    <AdminShellSection
      title="Support workspace"
      description="Redaction-safe project diagnostics for support and platform admins."
    >
      <AdminMasterDetail
        master={
          <>
            <TableToolbar title="Projects" description="Select a project to inspect redacted diagnostics." />
            <DataTable
              rows={projects}
              getRowKey={(row: any) => row.id}
              minWidth={540}
              emptyTitle="No projects"
              emptyDescription="No support-visible projects are available."
              columns={[
                {
                  key: "name",
                  header: "Name",
                  cell: (row: any) => (
                    <div className="grid gap-1">
                      <strong>{row.name}</strong>
                      {row.isSupportRisk ? <Badge tone="red">At risk</Badge> : null}
                    </div>
                  ),
                },
                { key: "owner", header: "Owner", cell: (row: any) => <small>{row.ownerEmail}</small> },
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
                  header: "Action",
                  cell: (row: any) => <Button variant={selectedProjectId === row.id ? "default" : "secondary"} onClick={() => onSelectProject(row.id)}>Inspect</Button>,
                },
              ]}
            />
          </>
        }
        detail={
          selectedProjectId ? (
            <div className="grid gap-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="m-0 text-lg font-bold tracking-[-.02em]">
                    Diagnostic console: {projectDetails?.name ?? "Loading..."}
                  </h2>
                  <p className="m-0 mt-1 text-sm text-muted-foreground">Support data is redacted and scoped to the selected project.</p>
                </div>
                <Button variant="ghost" onClick={onCloseProject}><X size={15} />Close</Button>
              </div>

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
                    <h3 className="m-0 text-sm font-bold">Team membership roles</h3>
                    <div className="grid gap-2">
                      {(projectDetails?.members ?? []).map((member: any) => (
                        <div className="key-value-row" key={member.userId}>
                          <span>{member.name || member.email}</span>
                          <Badge tone="blue">{member.role}</Badge>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="grid gap-3">
                    <TableToolbar title="Redacted diagnostic audit log" />
                    <AdminAuditTable
                      rows={projectDetails?.recentAudits ?? []}
                      getRowKey={(row: any) => row.id}
                      columns={[
                        { key: "event", header: "Event type", cell: (row: any) => <strong>{row.eventType}</strong> },
                        { key: "entity", header: "Entity", cell: (row: any) => row.entityType || "-" },
                        { key: "created", header: "Created", cell: (row: any) => <small>{new Date(row.createdAt).toLocaleString()}</small> },
                        { key: "metadata", header: "Metadata", cell: (row: any) => <AdminJsonPreview value={row.metadata} title="Metadata" /> },
                      ]}
                    />
                  </section>

                  <section className="grid gap-3">
                    <TableToolbar title="Redacted project jobs" />
                    <DataTable
                      rows={projectDetails?.recentJobs ?? []}
                      getRowKey={(row: any) => row.id}
                      minWidth={760}
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
            </div>
          ) : (
            <div className="placeholder-detail">Select a project to inspect diagnostics.</div>
          )
        }
      />
    </AdminShellSection>
  );
}

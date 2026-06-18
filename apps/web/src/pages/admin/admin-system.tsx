import { Activity, BrainCircuit, BookOpen, Clock, FileText, Plus, Eye, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Button, Card, Input, Textarea } from "../../components/ui";
import { DataTable, FieldGroup, FormActions, FormGrid, TableSkeleton } from "../../components/app-ui";
import { AdminMasterDetail, AdminShellSection } from "../../components/admin-ui";
import { Skeleton } from "../../components/ui/skeleton";
import { AdminEventRouter } from "../../components/admin-event-router";
import { useConfirm } from "../../components/confirm-dialog";

export type AdminSystemSubTab = "skills" | "flows" | "reports" | "knowledge" | "retention";

export function AdminSystemLayout({
  active,
  onChange,
  children,
}: {
  active: AdminSystemSubTab;
  onChange: (tab: AdminSystemSubTab) => void;
  children: ReactNode;
}) {
  const items = [
    { value: "skills", label: "Skill Registry", icon: BrainCircuit },
    { value: "flows", label: "Event Routing", icon: Activity },
    { value: "reports", label: "Report Definitions", icon: FileText },
    { value: "knowledge", label: "Knowledge Bases", icon: BookOpen },
    { value: "retention", label: "Retention Policies", icon: Clock },
  ] as const;

  return (
    <AdminShellSection title="System routing" description="Configure skills, flows, reports, knowledge bases, and retention policies.">
      <div className="admin-sub-layout">
        <aside className="admin-sub-sidebar">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.value}
                className={`admin-sub-tab ${active === item.value ? "active" : ""}`}
                onClick={() => onChange(item.value)}
                type="button"
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>
        <div className="admin-sub-content">{children}</div>
      </div>
    </AdminShellSection>
  );
}

export function AdminSkills({
  skills,
  page,
  totalPages,
  isAdmin,
  onCreate,
  onEdit,
  onDelete,
  onPage,
  isLoading,
}: {
  skills: any[];
  page: number;
  totalPages: number;
  isAdmin: boolean;
  onCreate: () => void;
  onEdit: (skill: any) => void;
  onDelete: (skill: any) => void;
  onPage: (updater: (page: number) => number) => void;
  isLoading?: boolean;
}) {
  const confirm = useConfirm();
  return (
    <Card className="flow-builder">
      <div className="flow-builder__header flex justify-between items-center mb-6">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <BrainCircuit className="text-emerald-500" size={20} />
            Skill Registry
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Register agent skills, edit prompt templates, and activate versions.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={onCreate} className="flex items-center gap-2" disabled={isLoading}>
            <Plus size={15} /> Create skill
          </Button>
        )}
      </div>

      {isLoading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : (
        <DataTable
          rows={skills}
          getRowKey={(row: any) => row.id}
          minWidth={820}
          emptyTitle="No skills"
          emptyDescription="No skill registry records were found."
          columns={[
            { key: "id", header: "Skill ID", cell: (row: any) => <code>{row.id}</code> },
            { key: "name", header: "Name", cell: (row: any) => <strong>{row.name}</strong> },
            { key: "description", header: "Description", cell: (row: any) => row.description },
            {
              key: "active",
              header: "Active version",
              cell: (row: any) => {
                const active = row.versions.find((version: any) => version.active);
                return active ? <Badge tone="green">v{active.version}</Badge> : <Badge tone="amber">Inactive</Badge>;
              },
            },
            {
              key: "actions",
              header: "Actions",
              cell: (row: any) => (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    title="Manage versions"
                    onClick={() => onEdit(row)}
                  >
                    <Eye size={16} />
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="destructive"
                      size="icon"
                      title="Delete skill"
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: "Delete skill",
                          description: `Delete skill "${row.name}" (${row.id})? This will delete all its versions and event mappings.`,
                          confirmText: "Delete",
                          variant: "destructive"
                        });
                        if (confirmed) {
                          onDelete(row);
                        }
                      }}
                    >
                      <Trash2 size={16} />
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}
      {!isLoading && (
        <div className="pagination-controls">
          <Button variant="secondary" onClick={() => onPage((prev) => Math.max(prev - 1, 1))} disabled={page <= 1}>Previous</Button>
          <span className="pagination-info">Page {page} of {totalPages}</span>
          <Button variant="secondary" onClick={() => onPage((prev) => Math.min(prev + 1, totalPages))} disabled={page >= totalPages}>Next</Button>
        </div>
      )}
    </Card>
  );
}

export function AdminRetention({
  retention,
  isAdmin,
  onUpdate,
  isLoading,
}: {
  retention: any[];
  isAdmin: boolean;
  onUpdate: (id: string, retentionDays: number) => void;
  isLoading?: boolean;
}) {
  return (
    <Card className="flow-builder">
      <div className="flow-builder__header flex justify-between items-center mb-6">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Clock className="text-emerald-500" size={20} />
            Retention Policies
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure data retention and cleanup schedules for compliance.
          </p>
        </div>
      </div>
      {isLoading ? (
        <TableSkeleton rows={3} columns={2} />
      ) : (
        <DataTable
          rows={retention}
          getRowKey={(row: any) => row.id}
          minWidth={720}
          emptyTitle="No retention policies"
          emptyDescription="Retention configuration has not been seeded."
          columns={[
            {
              key: "description",
              header: "Description",
              cell: (row: any) => (
                <div className="grid gap-1">
                  <strong>{row.description}</strong>
                  <code>{row.id}</code>
                </div>
              ),
            },
            {
              key: "days",
              header: "Retention",
              cell: (row: any) => (
                <div className="flex items-center gap-2">
                  <Input
                    aria-label={`Days for ${row.id}`}
                    type="number"
                    value={row.retentionDays ?? ""}
                    onChange={(event) => onUpdate(row.id, Number(event.target.value))}
                    disabled={!isAdmin}
                    placeholder="Forever"
                  />
                  <span className="text-xs text-muted-foreground">days</span>
                </div>
              ),
            },
          ]}
        />
      )}
    </Card>
  );
}

export function AdminFlows({ isAdmin }: { isAdmin: boolean }) {
  return <AdminEventRouter canWrite={isAdmin} />;
}

export function AdminReports({
  reports,
  selectedReportId,
  reportDrafts,
  isAdmin,
  onSelectReport,
  onDraft,
  onPublish,
  isLoading,
}: {
  reports: any[];
  selectedReportId: string | null;
  reportDrafts: Record<string, string>;
  isAdmin: boolean;
  onSelectReport: (id: string) => void;
  onDraft: (drafts: Record<string, string>) => void;
  onPublish: (id: string, templateKey: string) => void;
  isLoading?: boolean;
}) {
  const activeReport = reports.find((report) => report.id === (selectedReportId || reports[0]?.id));
  const activeVer = activeReport?.versions.find((item: any) => item.active) ?? activeReport?.versions[0];
  const draft = activeReport ? reportDrafts[activeReport.id] ?? activeVer?.templateKey ?? "" : "";

  if (isLoading) {
    return (
      <AdminMasterDetail
        master={
          <Card className="admin-master-pane flow-builder animate-pulse">
            <div className="flow-builder__header flex justify-between items-center mb-6">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <FileText className="text-emerald-500" size={20} />
                  Report Definitions
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Select a report definition to inspect or update.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 border border-border/50 rounded-xl flex flex-col gap-2 bg-secondary/10">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex gap-2 mt-1">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        }
        detail={
          <Card className="detail-card flow-builder animate-pulse">
            <div className="flow-builder__header flex justify-between items-center mb-6">
              <div className="flex flex-col gap-2 w-1/2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-3.5 w-full mt-1" />
              </div>
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
            <div className="field-group flex flex-col gap-2 mt-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-3.5 w-64" />
            </div>
          </Card>
        }
      />
    );
  }

  return (
    <AdminMasterDetail
      master={
        <Card className="admin-master-pane flow-builder">
          <div className="flow-builder__header flex justify-between items-center mb-6">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <FileText className="text-emerald-500" size={20} />
                Report Definitions
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Select a report definition to inspect or update.
              </p>
            </div>
          </div>
          <div className="admin-template-list">
            {reports.map((report) => {
              const active = report.versions.find((item: any) => item.active) ?? report.versions[0];
              const selected = (selectedReportId || reports[0]?.id) === report.id;
              return (
                <button key={report.id} className={`admin-list-item ${selected ? "active" : ""}`} onClick={() => onSelectReport(report.id)} type="button">
                  <strong>{report.name}</strong>
                  <div className="item-meta">
                    {active?.requiresLlm ? <Badge tone="amber">LLM</Badge> : <Badge tone="blue">Deterministic</Badge>}
                    <span>v{active?.version ?? "-"}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      }
      detail={
        activeReport ? (
          <Card className="detail-card flow-builder">
            <div className="flow-builder__header flex justify-between items-center mb-6">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <FileText className="text-emerald-500" size={20} />
                  {activeReport.name}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {activeVer?.requiresLlm ? "Requires Large Language Model processing" : "Generates deterministically via engine"}
                </p>
              </div>
              <Badge tone="green">v{activeVer?.version ?? "1"}</Badge>
            </div>
            <FieldGroup label="Associated document template key" description="Links this report definition to a layout template of the same key.">
              <Input
                value={draft}
                onChange={(event) => onDraft({ ...reportDrafts, [activeReport.id]: event.target.value })}
                disabled={!isAdmin}
              />
            </FieldGroup>
            {isAdmin ? (
              <FormActions>
                <Button onClick={() => onPublish(activeReport.id, draft)}>Update associated template key</Button>
              </FormActions>
            ) : null}
          </Card>
        ) : (
          <div className="placeholder-detail">Select a report to view and edit details.</div>
        )
      }
    />
  );
}

export function AdminKnowledge({
  knowledge,
  selectedKbId,
  knowledgeDrafts,
  isAdmin,
  onSelectKnowledge,
  onDraft,
  onPublish,
  isLoading,
}: {
  knowledge: any[];
  selectedKbId: string | null;
  knowledgeDrafts: Record<string, string>;
  isAdmin: boolean;
  onSelectKnowledge: (id: string) => void;
  onDraft: (drafts: Record<string, string>) => void;
  onPublish: (id: string, markdown: string) => void;
  isLoading?: boolean;
}) {
  const activeKb = knowledge.find((base) => base.id === (selectedKbId || knowledge[0]?.id));
  const activeVer = activeKb?.versions.find((item: any) => item.active) ?? activeKb?.versions[0];
  const draft = activeKb ? knowledgeDrafts[activeKb.id] ?? activeVer?.markdown ?? "" : "";

  if (isLoading) {
    return (
      <AdminMasterDetail
        master={
          <Card className="admin-master-pane flow-builder animate-pulse">
            <div className="flow-builder__header flex justify-between items-center mb-6">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <BookOpen className="text-emerald-500" size={20} />
                  Knowledge Bases
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Select a knowledge base to inspect or update.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5 mt-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 border border-border/50 rounded-xl flex flex-col gap-2 bg-secondary/10">
                  <Skeleton className="h-4 w-3/4" />
                  <div className="flex gap-2 mt-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        }
        detail={
          <Card className="detail-card flow-builder animate-pulse">
            <div className="flow-builder__header flex justify-between items-center mb-6">
              <div className="flex flex-col gap-2 w-1/2">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-3.5 w-full mt-1" />
              </div>
              <Skeleton className="h-6 w-12 rounded-full" />
            </div>
            <div className="field-group flex flex-col gap-2 mt-4">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-32 w-full" />
            </div>
          </Card>
        }
      />
    );
  }

  return (
    <AdminMasterDetail
      master={
        <Card className="admin-master-pane flow-builder">
          <div className="flow-builder__header flex justify-between items-center mb-6">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <BookOpen className="text-emerald-500" size={20} />
                Knowledge Bases
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Select a knowledge base to inspect or update.
              </p>
            </div>
          </div>
          <div className="admin-template-list">
            {knowledge.map((base) => {
              const active = base.versions.find((item: any) => item.active) ?? base.versions[0];
              const selected = (selectedKbId || knowledge[0]?.id) === base.id;
              return (
                <button key={base.id} className={`admin-list-item ${selected ? "active" : ""}`} onClick={() => onSelectKnowledge(base.id)} type="button">
                  <strong>{base.name}</strong>
                  <div className="item-meta">
                    <span>{base.topic}</span>
                    {active ? <Badge tone="green">v{active.version}</Badge> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      }
      detail={
        activeKb ? (
          <Card className="detail-card flow-builder">
            <div className="flow-builder__header flex justify-between items-center mb-6">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-semibold">
                  <BookOpen className="text-emerald-500" size={20} />
                  {activeKb.name}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Topic: <span className="font-semibold">{activeKb.topic}</span>
                </p>
              </div>
              <Badge tone="green">v{activeVer?.version ?? "1"}</Badge>
            </div>
            <FieldGroup label="Knowledge base markdown content">
              <Textarea
                className="admin-textarea monospace"
                value={draft}
                onChange={(event) => onDraft({ ...knowledgeDrafts, [activeKb.id]: event.target.value })}
                disabled={!isAdmin}
              />
            </FieldGroup>
            {isAdmin ? (
              <FormActions>
                <Button onClick={() => onPublish(activeKb.id, draft)}>Publish and activate content version</Button>
              </FormActions>
            ) : null}
          </Card>
        ) : (
          <div className="placeholder-detail">Select a knowledge base to view and edit details.</div>
        )
      }
    />
  );
}

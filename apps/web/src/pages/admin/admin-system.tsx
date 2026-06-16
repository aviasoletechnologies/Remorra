import { Activity, BrainCircuit, BookOpen, Clock, FileText } from "lucide-react";
import type { ReactNode } from "react";
import { Badge, Button, Card, Input, Textarea } from "../../components/ui";
import { DataTable, FieldGroup, FormActions, FormGrid, TableToolbar } from "../../components/app-ui";
import { AdminMasterDetail, AdminShellSection } from "../../components/admin-ui";
import { AdminFlowBuilder } from "../../components/admin-flow-builder";

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
    { value: "flows", label: "Guided Flows", icon: Activity },
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
  onPage,
}: {
  skills: any[];
  page: number;
  totalPages: number;
  isAdmin: boolean;
  onCreate: () => void;
  onEdit: (skill: any) => void;
  onPage: (updater: (page: number) => number) => void;
}) {
  return (
    <div className="grid gap-4">
      <TableToolbar
        title="Skill registry"
        description="Register agent skills, edit prompt templates, and activate versions."
        actions={isAdmin ? <Button onClick={onCreate}>Create skill</Button> : null}
      />
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
            cell: (row: any) => <Button variant="secondary" onClick={() => onEdit(row)}>Edit prompt</Button>,
          },
        ]}
      />
      <div className="pagination-controls">
        <Button variant="secondary" onClick={() => onPage((prev) => Math.max(prev - 1, 1))} disabled={page <= 1}>Previous</Button>
        <span className="pagination-info">Page {page} of {totalPages}</span>
        <Button variant="secondary" onClick={() => onPage((prev) => Math.min(prev + 1, totalPages))} disabled={page >= totalPages}>Next</Button>
      </div>
    </div>
  );
}

export function AdminRetention({
  retention,
  isAdmin,
  onUpdate,
}: {
  retention: any[];
  isAdmin: boolean;
  onUpdate: (id: string, retentionDays: number) => void;
}) {
  return (
    <div className="grid gap-4">
      <TableToolbar title="Retention policies" description="Configure data retention and cleanup schedules for compliance." />
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
    </div>
  );
}

export function AdminFlows({ isAdmin }: { isAdmin: boolean }) {
  return <AdminFlowBuilder canWrite={isAdmin} />;
}

export function AdminReports({
  reports,
  selectedReportId,
  reportDrafts,
  isAdmin,
  onSelectReport,
  onDraft,
  onPublish,
}: {
  reports: any[];
  selectedReportId: string | null;
  reportDrafts: Record<string, string>;
  isAdmin: boolean;
  onSelectReport: (id: string) => void;
  onDraft: (drafts: Record<string, string>) => void;
  onPublish: (id: string, templateKey: string) => void;
}) {
  const activeReport = reports.find((report) => report.id === (selectedReportId || reports[0]?.id));
  const activeVer = activeReport?.versions.find((item: any) => item.active) ?? activeReport?.versions[0];
  const draft = activeReport ? reportDrafts[activeReport.id] ?? activeVer?.templateKey ?? "" : "";

  return (
    <AdminMasterDetail
      master={
        <>
          <TableToolbar title="Report definitions" description="Select a report definition to inspect or update." />
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
        </>
      }
      detail={
        activeReport ? (
          <Card className="detail-card">
            <div className="detail-header">
              <div>
                <h2>{activeReport.name}</h2>
                <p className="subtitle">{activeVer?.requiresLlm ? "Requires Large Language Model processing" : "Generates deterministically via engine"}</p>
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
}: {
  knowledge: any[];
  selectedKbId: string | null;
  knowledgeDrafts: Record<string, string>;
  isAdmin: boolean;
  onSelectKnowledge: (id: string) => void;
  onDraft: (drafts: Record<string, string>) => void;
  onPublish: (id: string, markdown: string) => void;
}) {
  const activeKb = knowledge.find((base) => base.id === (selectedKbId || knowledge[0]?.id));
  const activeVer = activeKb?.versions.find((item: any) => item.active) ?? activeKb?.versions[0];
  const draft = activeKb ? knowledgeDrafts[activeKb.id] ?? activeVer?.markdown ?? "" : "";

  return (
    <AdminMasterDetail
      master={
        <>
          <TableToolbar title="Knowledge bases" description="Select a knowledge base to inspect or update." />
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
        </>
      }
      detail={
        activeKb ? (
          <Card className="detail-card">
            <div className="detail-header">
              <div>
                <h2>{activeKb.name}</h2>
                <span className="topic-tag">{activeKb.topic}</span>
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

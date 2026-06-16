import type { ReactNode } from "react";
import { Activity, BarChart3 } from "lucide-react";
import { cn } from "../lib/utils";
import { Badge, Card } from "./ui";
import { DataTable, type DataTableColumn, EditorPanel } from "./app-ui";

export function AdminShellSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="admin-shell-section">
      <AdminModuleHeader title={title} description={description} actions={actions} />
      {children}
    </section>
  );
}

export function AdminModuleHeader({
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  if (!actions) return null;
  return (
    <div className="admin-module-header justify-end">
      <div className="admin-module-actions">{actions}</div>
    </div>
  );
}

export function AdminStatGrid({ children }: { children: ReactNode }) {
  return <section className="admin-stat-grid">{children}</section>;
}

export function AdminStatCard({
  label,
  value,
  detail,
  icon,
  tone = "green",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: "green" | "amber" | "blue" | "red";
}) {
  return (
    <Card className="admin-stat-card">
      <div className={cn("admin-stat-icon", `admin-stat-icon-${tone}`)}>{icon ?? <BarChart3 size={16} />}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </Card>
  );
}

export function AdminMasterDetail({
  master,
  detail,
}: {
  master: ReactNode;
  detail: ReactNode;
}) {
  return (
    <div className="admin-master-detail-panel">
      <Card className="admin-master-pane">{master}</Card>
      <div className="admin-detail-pane">{detail}</div>
    </div>
  );
}

export function AdminEditorCard({
  title,
  description,
  action,
  children,
  icon,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card className="editor-panel flow-builder">
      <div className="flow-builder__header flex justify-between items-center mb-6">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            {icon}
            {title}
          </h2>
          {description ? (
            <p className="text-sm text-muted-foreground mt-1">
              {description}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="editor-panel-body">{children}</div>
    </Card>
  );
}

export function AdminAuditTable<T>({
  rows,
  columns,
  getRowKey,
}: {
  rows: T[];
  columns: Array<DataTableColumn<T>>;
  getRowKey: (row: T, index: number) => string;
}) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowKey={getRowKey}
      emptyTitle="No audit records"
      emptyDescription="Audited activity will appear here when available."
      minWidth={760}
    />
  );
}

export function AdminJsonPreview({
  value,
  title = "JSON preview",
}: {
  value: unknown;
  title?: string;
}) {
  return (
    <div className="admin-json-preview">
      <div>
        <Activity size={14} />
        <strong>{title}</strong>
        <Badge tone="neutral">redacted</Badge>
      </div>
      <pre>{typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2)}</pre>
    </div>
  );
}

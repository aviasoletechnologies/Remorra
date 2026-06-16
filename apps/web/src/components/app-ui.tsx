import type { ComponentType, ReactNode } from "react";
import { AlertCircle, ArrowRight, Inbox, LoaderCircle, LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "../lib/utils";
import { pageMotion } from "../lib/motion";
import { Badge, Button, Card, Input } from "./ui";
import { buttonVariants } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./ui/sheet";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: "green" | "blue" | "neutral";
};

export function PageHeader({ actions }: PageHeaderProps) {
  if (!actions) return null;
  return (
    <header className="page-header justify-end">
      <div className="page-header-actions">{actions}</div>
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div {...pageMotion} className={cn("page-container", className)}>
      {children}
    </motion.div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-0", className)}>
      {(title || description || action) && (
        <div className="section-card-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action}
        </div>
      )}
      <div className="section-card-content">{children}</div>
    </Card>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "green",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon?: ComponentType<{ className?: string; size?: number }>;
  tone?: "green" | "amber" | "blue" | "red";
}) {
  return (
    <Card className="metric-card">
      <div className={cn("metric-card-icon", `metric-card-icon-${tone}`)}>{Icon ? <Icon size={18} /> : null}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </Card>
  );
}

export function AppTabs<T extends string>({
  value,
  items,
  onChange,
  className,
}: {
  value: T;
  items: Array<{ value: T; label: string; icon?: ComponentType<{ size?: number }> }>;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("app-tabs", className)} role="tablist" aria-label="Page sections">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn("app-tab", active && "app-tab-active")}
            onClick={() => onChange(item.value)}
          >
            {Icon ? <Icon size={15} /> : null}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function KeyValueList({
  items,
}: {
  items: Array<{ label: string; value: ReactNode; tone?: "green" | "amber" | "red" | "blue" | "neutral" }>;
}) {
  return (
    <div className="key-value-list">
      {items.map((item) => (
        <div className="key-value-row" key={item.label}>
          <span>{item.label}</span>
          {item.tone ? <Badge tone={item.tone}>{item.value}</Badge> : <strong>{item.value}</strong>}
        </div>
      ))}
    </div>
  );
}

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  className?: string;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  emptyTitle = "No records found",
  emptyDescription = "When data exists, it will appear here.",
  minWidth = 720,
}: {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  minWidth?: number;
}) {
  if (!rows.length) {
    return <TableEmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="data-table-wrap">
      <Table className="data-table" style={{ minWidth }}>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead className={column.className} key={column.key}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={getRowKey(row, index)}>
              {columns.map((column) => (
                <TableCell className={column.className} key={column.key}>
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function TableToolbar({
  title,
  description,
  actions,
  search,
  onSearch,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  search?: string;
  onSearch?: (value: string) => void;
}) {
  return (
    <div className="table-toolbar">
      <div>
        {title ? <h2>{title}</h2> : null}
        {description ? <p>{description}</p> : null}
      </div>
      <div className="table-toolbar-actions">
        {onSearch ? (
          <Input
            aria-label="Search table"
            className="max-w-64"
            value={search ?? ""}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Search..."
          />
        ) : null}
        {actions}
      </div>
    </div>
  );
}

export function TableEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="table-empty-state">
      <Inbox size={18} />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="data-table-wrap">
      <div className="table-skeleton" style={{ gridTemplateColumns: `repeat(${columns}, minmax(120px, 1fr))` }}>
        {Array.from({ length: rows * columns }).map((_, index) => (
          <Skeleton className="h-4" key={index} />
        ))}
      </div>
    </div>
  );
}

export function FormGrid({ children, columns = 2 }: { children: ReactNode; columns?: 1 | 2 | 3 }) {
  return <div className={cn("form-grid", `form-grid-${columns}`)}>{children}</div>;
}

export function FieldGroup({
  label,
  description,
  error,
  children,
  className,
}: {
  label: string;
  description?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("field-group", className)}>
      <span>{label}</span>
      {children}
      {description ? <small>{description}</small> : null}
      {error ? <em>{error}</em> : null}
    </label>
  );
}

export function InlineField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="inline-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="form-actions">{children}</div>;
}

export function StatusBadge({ status }: { status?: string | null | undefined }) {
  const normalized = (status ?? "unknown").toLowerCase();
  const tone = normalized.includes("fail") || normalized.includes("deleted") || normalized.includes("error")
    ? "red"
    : normalized.includes("active") || normalized.includes("complete") || normalized.includes("success")
    ? "green"
    : normalized.includes("pending") || normalized.includes("draft") || normalized.includes("queued")
    ? "amber"
    : "neutral";
  return <Badge tone={tone}>{normalized}</Badge>;
}

export function RoleBadge({ role }: { role?: string | null | undefined }) {
  const normalized = role ?? "user";
  return <Badge tone={normalized === "admin" ? "red" : normalized === "support" ? "blue" : "neutral"}>{normalized}</Badge>;
}

export function JobStatusBadge({ status }: { status?: string | null | undefined }) {
  return <StatusBadge status={status} />;
}

export function CostBadge({ minor, currency = "USD" }: { minor?: number | null; currency?: string }) {
  const amount = ((minor ?? 0) / 100).toLocaleString(undefined, { style: "currency", currency });
  return <Badge tone="blue">{amount}</Badge>;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function DangerZone({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="danger-zone">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {action}
    </Card>
  );
}

export function DetailDrawer({
  open,
  title,
  description,
  children,
  onOpenChange,
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="detail-drawer-content">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function EditorPanel({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="editor-panel">
      <div className="editor-panel-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="editor-panel-body">{children}</div>
    </Card>
  );
}

export function LoadingState({ label = "Loading workspace..." }: { label?: string }) {
  return (
    <div className="state-panel" role="status">
      <LoaderCircle className="animate-spin text-primary" size={22} />
      <p>{label}</p>
      <div className="mt-2 grid w-full max-w-md gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <State icon={Inbox} title={title} description={description} action={action} />;
}

export function ErrorState({
  title = "Something went wrong",
  description,
  action,
}: {
  title?: string;
  description: string;
  action?: ReactNode;
}) {
  return <State icon={AlertCircle} title={title} description={description} action={action} tone="red" />;
}

export function PermissionState({ description }: { description: string }) {
  return <State icon={LockKeyhole} title="Access is limited" description={description} />;
}

function State({
  icon: Icon,
  title,
  description,
  action,
  tone = "green",
}: {
  icon: ComponentType<{ size?: number }>;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "green" | "red";
}) {
  return (
    <Card className="state-panel">
      <div className={cn("state-icon", tone === "red" && "state-icon-red")}><Icon size={22} /></div>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </Card>
  );
}

export function ActionLink({
  to,
  children,
  variant = "default",
  className,
}: {
  to: string;
  children: ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
}) {
  return (
    <Link to={to} className={cn(buttonVariants({ variant }), className)}>
      {children}
      <ArrowRight size={15} />
    </Link>
  );
}

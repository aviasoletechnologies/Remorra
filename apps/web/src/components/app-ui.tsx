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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: "green" | "blue" | "neutral";
};

export function PageHeader({ eyebrow, actions, tone = "green" }: PageHeaderProps) {
  if (!eyebrow && !actions) return null;
  return (
    <header className={cn("page-header", !eyebrow && "justify-end")}>
      {eyebrow ? <Badge tone={tone}>{eyebrow}</Badge> : null}
      {actions ? <div className="page-header-actions">{actions}</div> : null}
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
  onRowClick,
  compactEmpty = false,
}: {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  getRowKey: (row: T, index: number) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  minWidth?: number;
  onRowClick?: (row: T) => void;
  compactEmpty?: boolean;
}) {
  if (!rows.length) {
    return <TableEmptyState title={emptyTitle} description={emptyDescription} compact={compactEmpty} />;
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
            <TableRow
              key={getRowKey(row, index)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "cursor-pointer" : undefined}
            >
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

export function TableEmptyState({ title, description, compact = false }: { title: string; description?: string; compact?: boolean }) {
  if (compact) {
    return <div className="table-empty-state table-empty-state-compact"><Inbox size={15} /><span>{title}</span></div>;
  }
  return (
    <div className="table-empty-state">
      <Inbox size={18} />
      <strong>{title}</strong>
      {description ? <span>{description}</span> : null}
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

export function DetailDialog({
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-3rem)] w-full overflow-y-auto p-7 sm:max-w-3xl">
        <DialogHeader className="pr-10">
          <DialogTitle className="text-lg font-bold tracking-[-.02em]">{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="detail-drawer-content">{children}</div>
      </DialogContent>
    </Dialog>
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

export function PageSkeleton({
  eyebrow = true,
  title = true,
  actionsCount = 2,
  children,
}: {
  eyebrow?: boolean;
  title?: boolean;
  actionsCount?: number;
  children?: ReactNode;
}) {
  return (
    <Page className="animate-pulse">
      {(eyebrow || title || actionsCount > 0) && (
        <header className="page-header mb-6">
          <div className="flex flex-col gap-2">
            {eyebrow && <Skeleton className="h-5 w-24 rounded-full" />}
            {title && <Skeleton className="h-8 w-64 mt-1" />}
            {title && <Skeleton className="h-4 w-96 mt-2" />}
          </div>
          {actionsCount > 0 && (
            <div className="skeleton-header-actions">
              {Array.from({ length: actionsCount }).map((_, i) => (
                <Skeleton className="h-10 w-28 rounded-lg" key={i} />
              ))}
            </div>
          )}
        </header>
      )}
      {children}
    </Page>
  );
}

export function CardSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <Card className={cn("p-6 flex flex-col gap-4", className)}>
      <div className="flex justify-between items-center pb-2 border-b border-border">
        <div className="flex flex-col gap-2 w-1/3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
        <Skeleton className="h-5 w-12 rounded-full" />
      </div>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: rows }).map((_, i) => {
          const widths = ["w-full", "w-11/12", "w-4/5", "w-3/4"];
          return (
            <Skeleton
              className={cn("h-4", widths[i % widths.length])}
              key={i}
            />
          );
        })}
      </div>
    </Card>
  );
}

export function MetricGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
      {Array.from({ length: count }).map((_, i) => (
        <Card className="metric-card p-6 flex flex-col gap-2 relative overflow-hidden" key={i}>
          <div className="flex items-center justify-between mb-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="size-8 rounded-full" />
          </div>
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32 mt-1" />
        </Card>
      ))}
    </div>
  );
}

export function RichTableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar skeleton */}
      <div className="table-toolbar flex justify-between items-center">
        <div className="flex flex-col gap-2 w-1/4">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
        <div className="table-toolbar-actions flex gap-2">
          <Skeleton className="h-10 w-48 rounded-lg" />
          <Skeleton className="h-10 w-28 rounded-lg" />
        </div>
      </div>
      <div className="data-table-wrap border border-border rounded-xl overflow-hidden">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              {Array.from({ length: columns }).map((_, i) => (
                <TableHead key={i}>
                  <Skeleton className="h-4 w-16" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: columns }).map((_, colIndex) => {
                  const widths = ["w-2/3", "w-1/2", "w-3/4", "w-5/6"];
                  return (
                    <TableCell key={colIndex}>
                      <Skeleton className={cn("h-4", widths[(rowIndex + colIndex) % widths.length])} />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function FormSkeleton({ fieldsCount = 4 }: { fieldsCount?: number }) {
  return (
    <div className="form-grid form-grid-2">
      {Array.from({ length: fieldsCount }).map((_, i) => (
        <div className="field-group" key={i}>
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

export function ChatWorkspaceSkeleton() {
  return (
    <Page className="h-[calc(100vh-64px)] !p-4 md:!p-6 flex flex-col overflow-hidden animate-pulse">
      {/* Simulated top status bar/header */}
      <div className="flex justify-between items-center border-b border-border pb-4 mb-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-3.5 w-60" />
          </div>
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      <div className="w-full flex-grow flex gap-4 min-h-0 overflow-hidden">
        {/* Chat window panel */}
        <div className="flex-grow flex flex-col bg-secondary/15 border border-border rounded-2xl overflow-hidden p-6 relative">
          <div className="chat-skeleton-messages flex-grow overflow-y-auto pb-24">
            <div className="chat-skeleton-bubble-left p-4 mb-2">
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="chat-skeleton-bubble-right p-4 mb-2">
              <Skeleton className="h-4 w-36" />
            </div>
            <div className="chat-skeleton-bubble-left p-4 mb-2">
              <Skeleton className="h-4 w-52 mb-2" />
              <Skeleton className="h-4 w-44" />
            </div>
            <div className="chat-skeleton-bubble-right p-4 mb-2">
              <Skeleton className="h-4 w-40" />
            </div>
          </div>
          <div className="absolute bottom-6 left-6 right-6 flex gap-2 bg-background p-2 border border-border rounded-xl">
            <Skeleton className="h-10 flex-grow rounded-lg" />
            <Skeleton className="size-10 rounded-lg" />
          </div>
        </div>
      </div>
    </Page>
  );
}

export function KanbanSkeleton() {
  return (
    <PageSkeleton eyebrow={true} title={true} actionsCount={1}>
      <div className="flex flex-col gap-6 animate-pulse">
        {/* Fake tabs */}
        <div className="app-tabs flex gap-2 border-b border-border pb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton className="h-9 w-24 rounded-lg" key={i} />
          ))}
        </div>

        {/* Input cards */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-5 flex flex-col gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-48 mb-2" />
            <div className="flex gap-2">
              <Skeleton className="h-10 flex-grow" />
              <Skeleton className="h-10 w-20" />
            </div>
          </Card>
          <Card className="p-5 flex flex-col gap-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-3 w-48 mb-2" />
            <div className="flex gap-2">
              <Skeleton className="h-10 flex-grow" />
              <Skeleton className="h-10 w-20" />
            </div>
          </Card>
        </div>

        {/* Column headings */}
        <div className="flex items-center gap-1.5 border-b border-border pb-2 mt-4">
          <Skeleton className="h-4 w-32" />
        </div>

        {/* Kanban grid */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, colIndex) => (
            <div className="flex min-h-[460px] flex-col gap-3 rounded-2xl border border-border bg-secondary/35 p-3" key={colIndex}>
              <div className="flex justify-between items-center pb-2 border-b border-border">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-6 rounded-full" />
              </div>
              <div className="flex flex-col gap-2.5">
                {Array.from({ length: colIndex === 0 ? 2 : colIndex === 1 ? 1 : 0 }).map((_, cardIndex) => (
                  <Card className="p-4 flex flex-col gap-3 bg-card" key={cardIndex}>
                    <div className="flex justify-between items-center">
                      <Skeleton className="h-4.5 w-12 rounded-full" />
                      <Skeleton className="size-4" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-5/6" />
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/40">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageSkeleton>
  );
}

export function AdminConsoleSkeleton() {
  return (
    <PageSkeleton eyebrow={true} title={true} actionsCount={0}>
      <div className="flex flex-col gap-6 animate-pulse">
        {/* Fake admin tabs */}
        <div className="admin-tabbar flex gap-2 border-b border-border pb-2 overflow-x-auto">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton className="h-9 w-32 rounded-lg flex-shrink-0" key={i} />
          ))}
        </div>

        {/* Dashboard metrics preview */}
        <MetricGridSkeleton count={4} />

        {/* Main table module skeleton */}
        <RichTableSkeleton rows={6} columns={5} />
      </div>
    </PageSkeleton>
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

export function DisabledOverlay({ message = "Admin has disabled this feature" }: { message?: string }) {
  return (
    <div className="fixed top-16 bottom-0 right-0 left-0 md:left-[var(--sidebar-width)] z-30 flex flex-col items-center justify-center bg-background/50 transition-all duration-300">
      <Card className="max-w-md p-8 text-center shadow-2xl border border-destructive/25 bg-card relative overflow-hidden group">
        <div className="absolute -inset-px bg-gradient-to-r from-destructive/20 to-warning/20 rounded-2xl opacity-50 blur-sm group-hover:opacity-75 transition-opacity" />
        <div className="relative flex flex-col items-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-destructive-soft text-destructive mb-4 shadow-inner">
            <LockKeyhole size={24} className="animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-foreground tracking-tight mb-2">Access Disabled</h2>
          <p className="text-sm leading-relaxed text-foreground/80">{message}</p>
        </div>
      </Card>
    </div>
  );
}

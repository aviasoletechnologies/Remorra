import type { ComponentType, ReactNode } from "react";
import { AlertCircle, ArrowRight, Inbox, LoaderCircle, LockKeyhole } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "../lib/utils";
import { pageMotion } from "../lib/motion";
import { Badge, Card } from "./ui";
import { buttonVariants } from "./ui/button";
import { Skeleton } from "./ui/skeleton";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  tone?: "green" | "blue" | "neutral";
};

export function PageHeader({ eyebrow, title, description, actions, tone = "green" }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="min-w-0">
        {eyebrow ? <Badge tone={tone}>{eyebrow}</Badge> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
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

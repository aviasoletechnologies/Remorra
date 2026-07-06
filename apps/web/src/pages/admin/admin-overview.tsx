import { BrainCircuit, Database, ShieldCheck, Users, TrendingUp } from "lucide-react";
import { Button, Card } from "../../components/ui";
import { DataTable, TableSkeleton } from "../../components/app-ui";
import { AdminShellSection, AdminStatCard, AdminStatGrid } from "../../components/admin-ui";
import { Skeleton } from "../../components/ui/skeleton";

type PeriodPreset = "today" | "week" | "mtd" | "ytd" | "all";

export function AdminOverview({
  period,
  setPeriod,
  overviewMetrics,
  usageMetrics,
  jobsMetrics,
  onRetryJob,
  isLoading,
}: {
  period: PeriodPreset;
  setPeriod: (period: PeriodPreset) => void;
  overviewMetrics: any;
  usageMetrics: any;
  jobsMetrics: any;
  onRetryJob: (id: string) => void;
  isLoading?: boolean;
}) {
  return (
    <AdminShellSection
      title="Overview metrics"
      description="Operational health, usage, cost, and failed-job diagnostics for the selected period."
      actions={<PeriodTabs value={period} onChange={setPeriod} />}
    >
      <AdminStatGrid>
        <AdminStatCard
          label="Total users"
          value={isLoading ? <Skeleton className="h-8 w-16 mt-1" /> : (overviewMetrics?.users ?? "-")}
          icon={<Users size={16} />}
          tone="blue"
        />
        <AdminStatCard
          label="Active users"
          value={isLoading ? <Skeleton className="h-8 w-16 mt-1" /> : (overviewMetrics?.activeUsersCount ?? "-")}
          icon={<TrendingUp size={16} />}
          tone="green"
        />
        <AdminStatCard
          label="Projects active"
          value={isLoading ? <Skeleton className="h-8 w-20 mt-1" /> : `${overviewMetrics?.projects ?? "-"} / ${overviewMetrics?.activeProjects ?? "-"}`}
          icon={<Database size={16} />}
        />
        <AdminStatCard
          label="Failed jobs"
          value={isLoading ? <Skeleton className="h-8 w-12 mt-1" /> : (overviewMetrics?.failedJobs ?? "-")}
          icon={<ShieldCheck size={16} />}
          tone="red"
        />
      </AdminStatGrid>

      <div className="grid gap-5">
        {/* Tier & DRIVE breakdowns side-by-side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card className="flow-builder p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold mb-4">
              <Users className="text-emerald-500" size={18} />
              User Tier Breakdown
            </h2>
            <div className="grid gap-3">
              <div className="flex justify-between items-center text-sm py-1 border-b">
                <span className="font-medium text-muted-foreground">Free Tier</span>
                <span className="font-bold text-foreground">{overviewMetrics?.tierBreakdown?.free ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-1 border-b">
                <span className="font-medium text-muted-foreground">Paid Tier</span>
                <span className="font-bold text-foreground">{overviewMetrics?.tierBreakdown?.paid ?? 0}</span>
              </div>
            </div>
          </Card>

          <Card className="flow-builder p-5">
            <h2 className="flex items-center gap-2 text-base font-semibold mb-4">
              <Database className="text-emerald-500" size={18} />
              DRIVE Status Breakdown
            </h2>
            <div className="grid gap-3">
              <div className="flex justify-between items-center text-sm py-1 border-b">
                <span className="font-medium text-muted-foreground">Signed Up (pre-Discover)</span>
                <span className="font-bold text-foreground">{overviewMetrics?.statusBreakdown?.signedUp ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-1 border-b">
                <span className="font-medium text-muted-foreground">Inception (DRI Active)</span>
                <span className="font-bold text-foreground">{overviewMetrics?.statusBreakdown?.inception ?? 0}</span>
              </div>
              <div className="flex justify-between items-center text-sm py-1 border-b">
                <span className="font-medium text-muted-foreground">Delivery (Venture/Evolve reached)</span>
                <span className="font-bold text-foreground">{overviewMetrics?.statusBreakdown?.delivery ?? 0}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Token Usage Extremes Card */}
        <Card className="flow-builder p-5">
          <h2 className="flex items-center gap-2 text-xl font-semibold mb-4">
            <BrainCircuit className="text-emerald-500" size={20} />
            Token Usage Extremes (Highest / Lowest)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-xl bg-card">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Highest Usage User</span>
              {overviewMetrics?.tokenUsageExtremes?.highest ? (
                <div className="mt-2">
                  <p className="font-medium text-sm text-foreground">{overviewMetrics.tokenUsageExtremes.highest.name || "Unnamed User"}</p>
                  <p className="text-xs text-muted-foreground">{overviewMetrics.tokenUsageExtremes.highest.email}</p>
                  <p className="text-xs font-bold text-emerald-600 mt-2">Cost: ${((overviewMetrics.tokenUsageExtremes.highest.costMinor ?? 0) / 100).toFixed(2)}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">No usage recorded</p>
              )}
            </div>

            <div className="p-4 border rounded-xl bg-card">
              <span className="text-[10px] uppercase font-bold text-muted-foreground">Lowest Usage User</span>
              {overviewMetrics?.tokenUsageExtremes?.lowest ? (
                <div className="mt-2">
                  <p className="font-medium text-sm text-foreground">{overviewMetrics.tokenUsageExtremes.lowest.name || "Unnamed User"}</p>
                  <p className="text-xs text-muted-foreground">{overviewMetrics.tokenUsageExtremes.lowest.email}</p>
                  <p className="text-xs font-bold text-emerald-600 mt-2">Cost: ${((overviewMetrics.tokenUsageExtremes.lowest.costMinor ?? 0) / 100).toFixed(2)}</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">No usage recorded</p>
              )}
            </div>
          </div>
        </Card>

        {/* Cancellations Log */}
        <Card className="flow-builder">
          <div className="flow-builder__header flex justify-between items-center mb-6">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <Users className="text-emerald-500" size={20} />
                Recent Cancellations
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Subscribers who canceled, when, and their cancellation reason.
              </p>
            </div>
          </div>
          {isLoading ? (
            <TableSkeleton rows={3} columns={5} />
          ) : (
            <DataTable
              rows={overviewMetrics?.cancellations ?? []}
              getRowKey={(row: any) => row.id}
              minWidth={720}
              emptyTitle="No cancellations"
              emptyDescription="No subscription cancellations were recorded in this period."
              columns={[
                { key: "user", header: "User", cell: (row: any) => <strong>{row.user?.email ?? "unknown"}</strong> },
                { key: "tier", header: "Tier at cancellation", cell: (row: any) => <span className="uppercase text-xs">{row.tierAtCancellation}</span> },
                { key: "duration", header: "Subscriber duration", cell: (row: any) => `${row.subscriberDuration} days` },
                { key: "reason", header: "Reason", cell: (row: any) => <span className="text-muted-foreground">{row.reason}</span> },
                { key: "date", header: "Cancelled at", cell: (row: any) => <small>{new Date(row.cancelledAt).toLocaleString()}</small> },
              ]}
            />
          )}
        </Card>

        <Card className="flow-builder">
          <div className="flow-builder__header flex justify-between items-center mb-6">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <BrainCircuit className="text-emerald-500" size={20} />
                Token Usage Breakdown
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Usage grouped by resolved model or provider key.
              </p>
            </div>
          </div>
          {isLoading ? (
            <TableSkeleton rows={4} columns={5} />
          ) : (
            <DataTable
              rows={usageMetrics?.byModel ?? []}
              getRowKey={(row: any) => row.model}
              minWidth={720}
              emptyTitle="No token usage"
              emptyDescription="No AI invocations were recorded in this period."
              columns={[
                { key: "model", header: "Model tier / key", cell: (row: any) => <strong>{row.model}</strong> },
                { key: "input", header: "Input tokens", cell: (row: any) => row._sum?.inputTokens ?? 0 },
                { key: "output", header: "Output tokens", cell: (row: any) => row._sum?.outputTokens ?? 0 },
                { key: "cost", header: "Estimated cost", cell: (row: any) => `$${((row._sum?.costMinor ?? 0) / 100).toFixed(4)}` },
                { key: "count", header: "Invocations", cell: (row: any) => row._count ?? 0 },
              ]}
            />
          )}
        </Card>

        <Card className="flow-builder">
          <div className="flow-builder__header flex justify-between items-center mb-6">
            <div>
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <ShieldCheck className="text-emerald-500" size={20} />
                Failed Jobs Queue
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Recent failures with explicit retry controls.
              </p>
            </div>
          </div>
          {isLoading ? (
            <TableSkeleton rows={4} columns={5} />
          ) : (
            <DataTable
              rows={jobsMetrics?.recentFailed ?? []}
              getRowKey={(row: any) => row.id}
              minWidth={780}
              emptyTitle="No failed jobs"
              emptyDescription="No failed jobs require diagnostics for this period."
              columns={[
                { key: "id", header: "Job ID", cell: (row: any) => <code>{row.id.slice(0, 8)}</code> },
                { key: "queue", header: "Queue", cell: (row: any) => <strong>{row.queue}</strong> },
                { key: "error", header: "Failure reason", cell: (row: any) => <span className="text-destructive">{row.error}</span> },
                { key: "attempts", header: "Attempts", cell: (row: any) => row.attempts },
                {
                  key: "actions",
                  header: "Actions",
                  cell: (row: any) => <Button variant="secondary" onClick={() => onRetryJob(row.id)}>Retry</Button>,
                },
              ]}
            />
          )}
        </Card>
      </div>
    </AdminShellSection>
  );
}

function PeriodTabs({ value, onChange }: { value: PeriodPreset; onChange: (value: PeriodPreset) => void }) {
  return (
    <div className="period-tabs">
      {(["today", "week", "mtd", "ytd", "all"] as const).map((period) => (
        <button key={period} data-active={value === period} onClick={() => onChange(period)}>
          {period === "mtd" ? "MTD" : period === "ytd" ? "YTD" : period.charAt(0).toUpperCase() + period.slice(1)}
        </button>
      ))}
    </div>
  );
}

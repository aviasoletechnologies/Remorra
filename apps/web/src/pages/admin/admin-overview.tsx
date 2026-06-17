import { BrainCircuit, Database, ShieldCheck, Users } from "lucide-react";
import { Button, Card } from "../../components/ui";
import { DataTable } from "../../components/app-ui";
import { AdminShellSection, AdminStatCard, AdminStatGrid } from "../../components/admin-ui";

type PeriodPreset = "today" | "week" | "mtd" | "ytd" | "all";

export function AdminOverview({
  period,
  setPeriod,
  overviewMetrics,
  usageMetrics,
  jobsMetrics,
  onRetryJob,
}: {
  period: PeriodPreset;
  setPeriod: (period: PeriodPreset) => void;
  overviewMetrics: any;
  usageMetrics: any;
  jobsMetrics: any;
  onRetryJob: (id: string) => void;
}) {
  return (
    <AdminShellSection
      title="Overview metrics"
      description="Operational health, usage, cost, and failed-job diagnostics for the selected period."
      actions={<PeriodTabs value={period} onChange={setPeriod} />}
    >
      <AdminStatGrid>
        <AdminStatCard label="Total users" value={overviewMetrics?.users ?? "-"} icon={<Users size={16} />} tone="blue" />
        <AdminStatCard
          label="Projects active"
          value={`${overviewMetrics?.projects ?? "-"} / ${overviewMetrics?.activeProjects ?? "-"}`}
          icon={<Database size={16} />}
        />
        <AdminStatCard label="Failed jobs" value={overviewMetrics?.failedJobs ?? "-"} icon={<ShieldCheck size={16} />} tone="red" />
        <AdminStatCard
          label="Cost / margin"
          value={`$${(((overviewMetrics?.totalCost ?? 0)) / 100).toFixed(2)}`}
          detail={`Margin estimate: ${overviewMetrics?.margin ?? 100}%`}
          icon={<BrainCircuit size={16} />}
          tone="amber"
        />
      </AdminStatGrid>

      <div className="grid gap-5">
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

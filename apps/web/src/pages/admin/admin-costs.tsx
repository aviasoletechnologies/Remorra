import { ShieldAlert, DollarSign, Gauge } from "lucide-react";
import { Badge, Button, Input, Card } from "../../components/ui";
import { DataTable, DangerZone, TableSkeleton } from "../../components/app-ui";
import { AdminShellSection } from "../../components/admin-ui";

type CostDraft = {
  name: string;
  inputCostMinor: number;
  outputCostMinor: number;
  flatCostMinor: number;
  active: boolean;
};

export function AdminCosts({
  configs,
  drafts,
  isAdmin,
  setDrafts,
  onSave,
  isLoading,
}: {
  configs: any[];
  drafts: Record<string, CostDraft>;
  isAdmin: boolean;
  setDrafts: (drafts: Record<string, CostDraft>) => void;
  onSave: (key: string, data: CostDraft) => void;
  isLoading?: boolean;
}) {
  return (
    <AdminShellSection
      title="Costs manager"
      description="Adjust platform unit costs used for usage, margin, and operational estimates."
    >
      {!isAdmin ? (
        <DangerZone
          title="Read-only support mode"
          description="Cost rates can only be changed by a Platform Admin."
          action={<ShieldAlert size={18} />}
        />
      ) : null}

      <Card className="flow-builder">
        <div className="flow-builder__header flex justify-between items-center mb-6">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <DollarSign className="text-emerald-500" size={20} />
              Pricing Configurations
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Token costs use scaled minor units; flat costs use direct minor units.
            </p>
          </div>
        </div>
        {isLoading ? (
          <TableSkeleton rows={5} columns={9} />
        ) : (
          <DataTable
            rows={configs}
            getRowKey={(row: any) => row.key}
            minWidth={980}
            emptyTitle="No cost configs"
            emptyDescription="Cost configuration records have not been seeded."
            columns={[
              { key: "key", header: "Key", cell: (row: any) => <code>{row.key}</code> },
              {
                key: "name",
                header: "Name",
                cell: (row: any) => {
                  const draft = resolveDraft(row, drafts);
                  return (
                    <Input
                      aria-label={`Name for ${row.key}`}
                      value={draft.name}
                      onChange={(event) => setDrafts({ ...drafts, [row.key]: { ...draft, name: event.target.value } })}
                      disabled={!isAdmin}
                    />
                  );
                },
              },
              { key: "unit", header: "Unit type", cell: (row: any) => <Badge tone="blue">{row.unit}</Badge> },
              { key: "currency", header: "Currency", cell: (row: any) => row.currency },
              {
                key: "input",
                header: "Input cost",
                cell: (row: any) => {
                  const draft = resolveDraft(row, drafts);
                  return row.unit === "per_1m_tokens" ? (
                    <Input
                      aria-label={`Input cost for ${row.key}`}
                      type="number"
                      value={draft.inputCostMinor}
                      onChange={(event) => setDrafts({ ...drafts, [row.key]: { ...draft, inputCostMinor: Number(event.target.value) } })}
                      disabled={!isAdmin}
                    />
                  ) : "-";
                },
              },
              {
                key: "output",
                header: "Output cost",
                cell: (row: any) => {
                  const draft = resolveDraft(row, drafts);
                  return row.unit === "per_1m_tokens" ? (
                    <Input
                      aria-label={`Output cost for ${row.key}`}
                      type="number"
                      value={draft.outputCostMinor}
                      onChange={(event) => setDrafts({ ...drafts, [row.key]: { ...draft, outputCostMinor: Number(event.target.value) } })}
                      disabled={!isAdmin}
                    />
                  ) : "-";
                },
              },
              {
                key: "flat",
                header: "Flat cost",
                cell: (row: any) => {
                  const draft = resolveDraft(row, drafts);
                  return row.unit !== "per_1m_tokens" ? (
                    <Input
                      aria-label={`Flat cost for ${row.key}`}
                      type="number"
                      value={draft.flatCostMinor}
                      onChange={(event) => setDrafts({ ...drafts, [row.key]: { ...draft, flatCostMinor: Number(event.target.value) } })}
                      disabled={!isAdmin}
                    />
                  ) : "-";
                },
              },
              {
                key: "active",
                header: "Active",
                cell: (row: any) => {
                  const draft = resolveDraft(row, drafts);
                  return (
                    <input
                      aria-label={`Active state for ${row.key}`}
                      type="checkbox"
                      checked={draft.active}
                      onChange={(event) => setDrafts({ ...drafts, [row.key]: { ...draft, active: event.target.checked } })}
                      disabled={!isAdmin}
                    />
                  );
                },
              },
              {
                key: "actions",
                header: "Actions",
                cell: (row: any) => {
                  const draft = resolveDraft(row, drafts);
                  return isAdmin ? <Button variant="secondary" onClick={() => onSave(row.key, draft)}>Save</Button> : null;
                },
              },
            ]}
          />
        )}
      </Card>
    </AdminShellSection>
  );
}

function resolveDraft(row: any, drafts: Record<string, CostDraft>): CostDraft {
  return drafts[row.key] || {
    name: row.name,
    inputCostMinor: row.inputCostMinor,
    outputCostMinor: row.outputCostMinor,
    flatCostMinor: row.flatCostMinor,
    active: row.active,
  };
}

export function AdminHealthScoreWeights({
  weights,
  drafts,
  isAdmin,
  setDrafts,
  onSave,
  isLoading,
}: {
  weights: any[];
  drafts: Record<string, number>;
  isAdmin: boolean;
  setDrafts: (drafts: Record<string, number>) => void;
  onSave: (component: string, weight: number) => void;
  isLoading?: boolean;
}) {
  const total = weights.reduce((sum, row) => sum + (drafts[row.component] ?? row.weight), 0);

  return (
    <AdminShellSection
      title="Health Score weights"
      description="Component weights for the one-time Initiate readiness assessment (RemoraDocument §20 — configuration, not code). Must sum to 100."
    >
      {!isAdmin ? (
        <DangerZone
          title="Read-only support mode"
          description="Health Score weights can only be changed by a Platform Admin."
          action={<ShieldAlert size={18} />}
        />
      ) : null}

      <Card className="flow-builder">
        <div className="flow-builder__header flex justify-between items-center mb-6">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Gauge className="text-emerald-500" size={20} />
              Component Weights
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Current total: <strong className={total === 100 ? "text-emerald-500" : "text-destructive"}>{total}%</strong>
            </p>
          </div>
        </div>
        {isLoading ? (
          <TableSkeleton rows={7} columns={3} />
        ) : (
          <DataTable
            rows={weights}
            getRowKey={(row: any) => row.component}
            minWidth={480}
            emptyTitle="No weight configs"
            emptyDescription="Health Score weight records have not been seeded."
            columns={[
              { key: "component", header: "Component", cell: (row: any) => <code className="capitalize">{row.component.replaceAll("_", " ")}</code> },
              {
                key: "weight",
                header: "Weight %",
                cell: (row: any) => (
                  <Input
                    aria-label={`Weight for ${row.component}`}
                    type="number"
                    min={0}
                    max={100}
                    value={drafts[row.component] ?? row.weight}
                    onChange={(event) => setDrafts({ ...drafts, [row.component]: Number(event.target.value) })}
                    disabled={!isAdmin}
                  />
                ),
              },
              {
                key: "actions",
                header: "Actions",
                cell: (row: any) => {
                  const weight = drafts[row.component] ?? row.weight;
                  return isAdmin ? <Button variant="secondary" onClick={() => onSave(row.component, weight)}>Save</Button> : null;
                },
              },
            ]}
          />
        )}
      </Card>
    </AdminShellSection>
  );
}

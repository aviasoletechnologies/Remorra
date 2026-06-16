import { ShieldAlert } from "lucide-react";
import { Badge, Button, Input } from "../../components/ui";
import { DataTable, DangerZone, TableToolbar } from "../../components/app-ui";
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
}: {
  configs: any[];
  drafts: Record<string, CostDraft>;
  isAdmin: boolean;
  setDrafts: (drafts: Record<string, CostDraft>) => void;
  onSave: (key: string, data: CostDraft) => void;
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

      <TableToolbar title="Pricing configurations" description="Token costs use scaled minor units; flat costs use direct minor units." />
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

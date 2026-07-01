import { useState } from "react";
import { ShieldAlert, Sparkles, Trash2, Plus } from "lucide-react";
import { Badge, Button, Input, Card } from "../../components/ui";
import { DataTable, DangerZone, TableSkeleton } from "../../components/app-ui";
import { AdminShellSection } from "../../components/admin-ui";

const ENTITY_TYPE_OPTIONS = ["Goal", "Epic", "Story", "Persona", "RaidItem"];

type AutoCaptureRule = {
  id: string;
  pattern: string;
  entityTypes: string[];
  contextText: string;
  minOccurrences: number;
  active: boolean;
};

type ReviewConfig = {
  id: string;
  cronExpression: string;
  active: boolean;
};

export function AdminContextAutomation({
  rules,
  reviewConfig,
  isAdmin,
  isLoading,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onUpdateReviewConfig,
}: {
  rules: AutoCaptureRule[];
  reviewConfig: ReviewConfig | undefined;
  isAdmin: boolean;
  isLoading?: boolean;
  onCreateRule: (data: { pattern: string; entityTypes: string[]; contextText: string; minOccurrences: number }) => void;
  onUpdateRule: (id: string, data: Partial<AutoCaptureRule>) => void;
  onDeleteRule: (id: string) => void;
  onUpdateReviewConfig: (id: string, data: { cronExpression?: string; active?: boolean }) => void;
}) {
  const [pattern, setPattern] = useState("");
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [contextText, setContextText] = useState("");
  const [minOccurrences, setMinOccurrences] = useState(2);
  const [cronDraft, setCronDraft] = useState(reviewConfig?.cronExpression ?? "");

  const toggleEntityType = (type: string) => {
    setEntityTypes((current) => (current.includes(type) ? current.filter((t) => t !== type) : [...current, type]));
  };

  return (
    <AdminShellSection
      title="Project context automation"
      description="RemoraDocument §10 — Layer 1 auto-capture rules and Layer 3 drift-review schedule. All proposals still require founder confirmation."
    >
      {!isAdmin ? (
        <DangerZone
          title="Read-only support mode"
          description="Automation rules can only be changed by a Platform Admin."
          action={<ShieldAlert size={18} />}
        />
      ) : null}

      <Card className="flow-builder">
        <div className="flow-builder__header flex justify-between items-center mb-6">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Sparkles className="text-emerald-500" size={20} />
              Layer 1 — Auto-capture rules
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Pattern in entity title/description → project context text, once seen across enough entities.
            </p>
          </div>
        </div>

        {isAdmin ? (
          <div className="mb-4 grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-2">
            <Input placeholder="Pattern (e.g. mobile)" value={pattern} onChange={(e) => setPattern(e.target.value)} />
            <Input placeholder="Context text to propose" value={contextText} onChange={(e) => setContextText(e.target.value)} />
            <Input
              type="number"
              min={1}
              placeholder="Min occurrences"
              value={minOccurrences}
              onChange={(e) => setMinOccurrences(Number(e.target.value))}
            />
            <div className="flex flex-wrap gap-1.5 items-center">
              {ENTITY_TYPE_OPTIONS.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleEntityType(type)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    entityTypes.includes(type) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            <Button
              className="sm:col-span-2"
              disabled={!pattern.trim() || !contextText.trim() || entityTypes.length === 0}
              onClick={() => {
                onCreateRule({ pattern: pattern.trim(), entityTypes, contextText: contextText.trim(), minOccurrences });
                setPattern("");
                setContextText("");
                setEntityTypes([]);
                setMinOccurrences(2);
              }}
            >
              <Plus size={14} /> Add rule
            </Button>
          </div>
        ) : null}

        {isLoading ? (
          <TableSkeleton rows={4} columns={5} />
        ) : (
          <DataTable
            rows={rules}
            getRowKey={(row: AutoCaptureRule) => row.id}
            minWidth={720}
            emptyTitle="No auto-capture rules"
            emptyDescription="Add a pattern rule above to start Layer 1 auto-capture."
            columns={[
              { key: "pattern", header: "Pattern", cell: (row: AutoCaptureRule) => <code>{row.pattern}</code> },
              { key: "entityTypes", header: "Entities", cell: (row: AutoCaptureRule) => row.entityTypes.join(", ") },
              { key: "contextText", header: "Context text", cell: (row: AutoCaptureRule) => row.contextText },
              { key: "minOccurrences", header: "Min occurrences", cell: (row: AutoCaptureRule) => row.minOccurrences },
              {
                key: "active",
                header: "Active",
                cell: (row: AutoCaptureRule) => (
                  <input
                    type="checkbox"
                    checked={row.active}
                    disabled={!isAdmin}
                    onChange={(e) => onUpdateRule(row.id, { active: e.target.checked })}
                  />
                ),
              },
              {
                key: "actions",
                header: "Actions",
                cell: (row: AutoCaptureRule) =>
                  isAdmin ? (
                    <Button variant="secondary" size="icon-xs" onClick={() => onDeleteRule(row.id)}>
                      <Trash2 size={12} />
                    </Button>
                  ) : null,
              },
            ]}
          />
        )}
      </Card>

      <Card className="flow-builder">
        <div className="flow-builder__header flex justify-between items-center mb-6">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Sparkles className="text-emerald-500" size={20} />
              Layer 3 — Drift review schedule
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Cron expression for the periodic Skill scan. Takes effect on next worker restart.
            </p>
          </div>
        </div>
        {reviewConfig ? (
          <div className="flex flex-wrap items-center gap-3">
            <Input
              className="max-w-xs"
              value={cronDraft || reviewConfig.cronExpression}
              onChange={(e) => setCronDraft(e.target.value)}
              disabled={!isAdmin}
            />
            <Badge tone={reviewConfig.active ? "green" : "neutral"}>{reviewConfig.active ? "Active" : "Paused"}</Badge>
            {isAdmin ? (
              <>
                <Button
                  onClick={() => onUpdateReviewConfig(reviewConfig.id, { cronExpression: cronDraft || reviewConfig.cronExpression })}
                >
                  Save schedule
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onUpdateReviewConfig(reviewConfig.id, { active: !reviewConfig.active })}
                >
                  {reviewConfig.active ? "Pause" : "Resume"}
                </Button>
              </>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No review config found.</p>
        )}
      </Card>
    </AdminShellSection>
  );
}

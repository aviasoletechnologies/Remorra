import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Copy, Plus, Rocket, Save, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { Badge, Button, Card } from "./ui";
import { TableEmptyState, TableToolbar } from "./app-ui";

type Step = {
  id?: string;
  key: string;
  displayName: string;
  description?: string | null;
  skillId?: string | null;
  parentStepKey?: string | null;
  position: number;
  executionMode: string;
  optional: boolean;
  requiresConfirmation: boolean;
  entryRules: Record<string, unknown>;
  requiredOutputs: string[];
  completionRules: Record<string, unknown>;
  transitionRules: { nextStepKey?: string; terminal?: boolean };
};

type FlowVersion = {
  id: string;
  version: number;
  status: "draft" | "published" | "archived";
  steps: Step[];
};

type Flow = {
  id: string;
  name: string;
  description: string;
  versions: FlowVersion[];
};

export function AdminFlowBuilder({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const { data: flows = [] } = useQuery<Flow[]>({ queryKey: ["admin-flows"], queryFn: () => api("/admin/flows") });
  const { data: skillsData } = useQuery<any>({ queryKey: ["admin-flow-skills"], queryFn: () => api("/admin/skills?limit=100") });
  const skills = skillsData?.items ?? [];
  const [flowId, setFlowId] = useState("");
  const selectedFlow = flows.find((flow) => flow.id === flowId) ?? flows[0];
  const [versionId, setVersionId] = useState("");
  const selectedVersion = selectedFlow?.versions.find((version) => version.id === versionId) ?? selectedFlow?.versions[0];
  const [steps, setSteps] = useState<Step[]>([]);
  const [validation, setValidation] = useState<{ valid: boolean; errors: string[]; warnings: string[] } | null>(null);

  useEffect(() => {
    if (selectedFlow && selectedFlow.id !== flowId) setFlowId(selectedFlow.id);
  }, [flowId, selectedFlow]);
  useEffect(() => {
    if (selectedVersion && selectedVersion.id !== versionId) setVersionId(selectedVersion.id);
  }, [selectedVersion, versionId]);
  useEffect(() => {
    setSteps((selectedVersion?.steps ?? []).map((step) => ({ ...step, requiredOutputs: Array.isArray(step.requiredOutputs) ? step.requiredOutputs : [] })));
    setValidation(null);
  }, [selectedVersion?.id]);

  const ordered = useMemo(() => [...steps].sort((a, b) => a.position - b.position), [steps]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-flows"] });
  const clone = useMutation({
    mutationFn: () => api<FlowVersion>(`/admin/flows/${selectedFlow!.id}/versions`, { method: "POST" }),
    onSuccess: async (created) => {
      await refresh();
      setVersionId(created.id);
    },
  });
  const save = useMutation({
    mutationFn: () => api<any>(`/admin/flow-versions/${selectedVersion!.id}`, {
      method: "PUT",
      body: JSON.stringify({ steps: resequence(ordered) }),
    }),
    onSuccess: async (result) => {
      setValidation(result);
      await refresh();
    },
  });
  const validate = useMutation({
    mutationFn: () => api<any>(`/admin/flow-versions/${selectedVersion!.id}/validate`, { method: "POST" }),
    onSuccess: setValidation,
  });
  const publish = useMutation({
    mutationFn: () => api(`/admin/flow-versions/${selectedVersion!.id}/publish`, { method: "POST" }),
    onSuccess: async () => {
      setValidation(null);
      await refresh();
    },
  });

  if (!selectedFlow || !selectedVersion) {
    return (
      <Card className="flow-builder">
        <TableToolbar title="Guided Flow Builder" description="Configure the exact skill order used by the single customer conversation." />
        <TableEmptyState
          title="No flow definitions"
          description="Seed the default journey or create one through the admin API. Flow records will appear here using the same admin empty-state pattern as other tables."
        />
      </Card>
    );
  }
  const editable = canWrite && selectedVersion.status === "draft";

  const update = (index: number, patch: Partial<Step>) => {
    setSteps((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  };
  const move = (index: number, offset: number) => {
    const next = [...ordered];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    const current = next[index];
    const replacement = next[target];
    if (!current || !replacement) return;
    next[index] = replacement;
    next[target] = current;
    setSteps(resequence(next));
  };

  return (
    <Card className="flow-builder">
      <div className="flow-builder__header">
        <div>
          <h2>Guided Flow Builder</h2>
          <p className="section-description">Configure the exact skill order used by the single customer conversation. Event routing remains separate.</p>
        </div>
        <div className="heading-actions">
          <select className="admin-input" value={selectedFlow.id} onChange={(event) => { setFlowId(event.target.value); setVersionId(""); }}>
            {flows.map((flow) => <option key={flow.id} value={flow.id}>{flow.name}</option>)}
          </select>
          <select className="admin-input" value={selectedVersion.id} onChange={(event) => setVersionId(event.target.value)}>
            {selectedFlow.versions.map((version) => <option key={version.id} value={version.id}>v{version.version} - {version.status}</option>)}
          </select>
          <Badge tone={selectedVersion.status === "published" ? "green" : selectedVersion.status === "draft" ? "amber" : "neutral"}>{selectedVersion.status}</Badge>
        </div>
      </div>

      <div className="flow-builder__actions">
        {canWrite && selectedVersion.status !== "draft" ? <Button variant="secondary" onClick={() => clone.mutate()} disabled={clone.isPending}><Copy size={15} />Clone as draft</Button> : null}
        {editable ? <Button variant="secondary" onClick={() => setSteps((items) => [...items, blankStep(items.length)])}><Plus size={15} />Add step</Button> : null}
        {editable ? <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending}><Save size={15} />Save</Button> : null}
        <Button variant="secondary" onClick={() => validate.mutate()} disabled={validate.isPending}>Validate</Button>
        {editable ? <Button onClick={() => publish.mutate()} disabled={publish.isPending || validation?.valid !== true}><Rocket size={15} />Publish</Button> : null}
      </div>

      {validation ? (
        <div className={`flow-validation flow-validation--${validation.valid ? "valid" : "invalid"}`}>
          <strong>{validation.valid ? "Flow is valid" : "Flow needs attention"}</strong>
          {validation.errors.map((error) => <span key={error}>{error}</span>)}
          {validation.warnings.map((warning) => <span key={warning}>Warning: {warning}</span>)}
        </div>
      ) : null}

      <div className="flow-builder__steps">
        {ordered.map((step, index) => (
          <div className="flow-builder__step" key={`${step.key}-${index}`}>
            <div className="flow-builder__step-tools">
              <strong>{index + 1}</strong>
              <button aria-label="Move up" disabled={!editable || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
              <button aria-label="Move down" disabled={!editable || index === ordered.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
              <button aria-label="Delete step" disabled={!editable} onClick={() => setSteps((items) => items.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={14} /></button>
            </div>
            <div className="flow-builder__fields">
              <label>Step key<input className="admin-input" disabled={!editable} value={step.key} onChange={(event) => update(index, { key: event.target.value })} /></label>
              <label>Display name<input className="admin-input" disabled={!editable} value={step.displayName} onChange={(event) => update(index, { displayName: event.target.value })} /></label>
              <label>Execution mode<select className="admin-input" disabled={!editable} value={step.executionMode} onChange={(event) => update(index, { executionMode: event.target.value })}>
                <option value="visible_chat">Visible chat</option>
                <option value="internal_helper">Internal helper</option>
                <option value="deterministic">Deterministic</option>
                <option value="explicit_action">Explicit action</option>
                <option value="human_review">Human review</option>
              </select></label>
              <label>Skill<select className="admin-input" disabled={!editable} value={step.skillId ?? ""} onChange={(event) => update(index, { skillId: event.target.value || null })}>
                <option value="">No LLM skill</option>
                {skills.map((skill: any) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}
              </select></label>
              <label>Parent step<input className="admin-input" disabled={!editable} value={step.parentStepKey ?? ""} onChange={(event) => update(index, { parentStepKey: event.target.value || null })} placeholder="Only for internal helpers" /></label>
              <label>Next step<input className="admin-input" disabled={!editable} value={step.transitionRules?.nextStepKey ?? ""} onChange={(event) => update(index, { transitionRules: event.target.value ? { nextStepKey: event.target.value } : { terminal: true } })} placeholder="Blank means terminal" /></label>
              <label className="flow-builder__wide">Required outputs<input className="admin-input" disabled={!editable} value={step.requiredOutputs.join(", ")} onChange={(event) => update(index, { requiredOutputs: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} placeholder="problemStatement, targetAudience" /></label>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function resequence(steps: Step[]) {
  return steps.map((step, index) => ({ ...step, position: (index + 1) * 10 }));
}

function blankStep(index: number): Step {
  return {
    key: `new-step-${index + 1}`,
    displayName: "New guided step",
    skillId: null,
    parentStepKey: null,
    position: (index + 1) * 10,
    executionMode: "visible_chat",
    optional: false,
    requiresConfirmation: false,
    entryRules: {},
    requiredOutputs: [],
    completionRules: { operator: "all_required_outputs" },
    transitionRules: { terminal: true },
  };
}

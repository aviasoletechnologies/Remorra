import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Plus, ShieldAlert, Sparkles, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { Badge, Button, Card } from "./ui";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "./ui/select";
import { DataTable, TableSkeleton } from "./app-ui";
import { useConfirm } from "./confirm-dialog";

type Skill = {
  id: string;
  name: string;
  description: string;
  phase: string;
};

type EventMapping = {
  id: string;
  eventType: string;
  conditions: Record<string, string>;
  skillId: string;
  targetQueue: string;
  active: boolean;
  skill: Skill;
};

export function AdminEventRouter({ canWrite }: { canWrite: boolean }) {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [activePhase, setActivePhase] = useState<string>("discover");

  const { data: mappingsData, isLoading } = useQuery<any>({
    queryKey: ["admin-event-mappings", page, activePhase],
    queryFn: () => api(`/admin/event-mappings?page=${page}&limit=${PAGE_SIZE}&phase=${activePhase}`),
  });
  const mappings = (mappingsData?.items ?? []) as EventMapping[];
  const totalPages = mappingsData?.totalPages ?? 1;

  const { data: skillsData } = useQuery<any>({
    queryKey: ["admin-flow-skills"],
    queryFn: () => api("/admin/skills?limit=100"),
  });
  const skills = skillsData?.items ?? [];
  const filteredSkills = skills.filter((s: any) => s.phase === activePhase);

  const { data: eventTypesData } = useQuery<{ items: Array<{ eventType: string; table: string; operation: string; group: string }> }>({
    queryKey: ["admin-event-types"],
    queryFn: () => api("/admin/event-types"),
  });
  const eventTypes = eventTypesData?.items ?? [];

  const [newEventType, setNewEventType] = useState("");
  const [newSkillId, setNewSkillId] = useState("");
  const [conditions, setConditions] = useState<{ key: string; value: string }[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-event-mappings"] });
  };

  const createMapping = useMutation({
    mutationFn: (body: { eventType: string; skillId: string; targetQueue?: string; conditions: Record<string, string> }) =>
      api<EventMapping>("/admin/event-mappings", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      refresh();
      setNewEventType("");
      setNewSkillId("");
      setConditions([]);
      setShowAddForm(false);
    },
  });

  const updateMapping = useMutation({
    mutationFn: ({ id, active, skillId, conditions }: { id: string; active?: boolean; skillId?: string; conditions?: Record<string, unknown> }) =>
      api<EventMapping>(`/admin/event-mappings/${id}`, {
        method: "PUT",
        body: JSON.stringify({ active, skillId, conditions }),
      }),
    onSuccess: refresh,
  });

  const deleteMapping = useMutation({
    mutationFn: (id: string) =>
      api(`/admin/event-mappings/${id}`, {
        method: "DELETE",
      }),
    onSuccess: refresh,
  });

  const addCondition = () => {
    setConditions([...conditions, { key: "", value: "" }]);
  };

  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const updateConditionKey = (index: number, key: string) => {
    const updated = [...conditions];
    const item = updated[index];
    if (item) {
      item.key = key;
      setConditions(updated);
    }
  };

  const updateConditionValue = (index: number, val: string) => {
    const updated = [...conditions];
    const item = updated[index];
    if (item) {
      item.value = val;
      setConditions(updated);
    }
  };

  const groupedEvents = eventTypes.reduce((acc, curr) => {
    const list = acc[curr.group] ?? [];
    list.push(curr);
    acc[curr.group] = list;
    return acc;
  }, {} as Record<string, typeof eventTypes>);


  const handleSave = () => {
    const conditionsObj = conditions.reduce((acc, curr) => {
      if (curr.key.trim()) {
        acc[curr.key.trim()] = curr.value.trim();
      }
      return acc;
    }, {} as Record<string, string>);

    createMapping.mutate({
      eventType: newEventType,
      skillId: newSkillId,
      targetQueue: "ai.conversation",
      conditions: conditionsObj,
    });
  };

  return (
    <Card className="flow-builder">
      <div className="flow-builder__header flex justify-between items-center mb-6">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Activity className="text-emerald-500" size={20} />
            Event Routing Configuration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Map application database events to specialized AI Skills with conditional routing.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setShowAddForm(true)} className="flex items-center gap-2" disabled={isLoading}>
            <Plus size={15} /> Add Event Route
          </Button>
        )}
      </div>

      <div className="flex border-b border-zinc-200/80 dark:border-zinc-800/80 mb-6 gap-2">
        {(["discover", "refine", "initiate", "venture", "evolve"] as const).map((phase) => (
          <button
            key={phase}
            type="button"
            onClick={() => {
              setActivePhase(phase);
              setPage(1);
            }}
            className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all capitalize border-b-2 cursor-pointer ${
              activePhase === phase
                ? "border-emerald-600 text-emerald-600 dark:border-emerald-500 dark:text-emerald-400 font-bold"
                : "border-transparent text-muted-foreground hover:text-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {phase}
          </button>
        ))}
      </div>

      {showAddForm && (
        <div className="admin-modal-overlay">
          <Card className="admin-modal-content">
            <div className="modal-header">
              <div>
                <h2 className="flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-500" />
                  New Event Route Rule
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Map database events to specialized AI Skills with conditional routing.
                </p>
              </div>
              <Button variant="ghost" onClick={() => {
                setNewEventType("");
                setNewSkillId("");
                setConditions([]);
                setShowAddForm(false);
              }}>
                Close
              </Button>
            </div>

            <div className="modal-body grid gap-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Event Type</span>
                  <Select value={newEventType} onValueChange={(val) => setNewEventType(val ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select an event..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(groupedEvents).map(([groupName, items]) => (
                        <SelectGroup key={groupName}>
                          <SelectLabel>{groupName}</SelectLabel>
                          {items.map((item) => (
                            <SelectItem key={item.eventType} value={item.eventType}>
                              {item.eventType}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">Target AI Skill</span>
                  <Select value={newSkillId} onValueChange={(val) => setNewSkillId(val ?? "")}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a skill..." />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredSkills.map((skill: any) => (
                        <SelectItem key={skill.id} value={skill.id}>
                          {skill.name} ({skill.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-2">
                <span className="text-xs font-semibold text-muted-foreground">Routing Conditions (Optional)</span>
                <div className="grid gap-2">
                  {conditions.map((cond, index) => (
                    <div key={index} className="flex gap-2 items-center">
                      <Select value={cond.key} onValueChange={(val) => updateConditionKey(index, val ?? "")}>
                        <SelectTrigger className="max-w-[150px]" size="sm">
                          <SelectValue placeholder="Select key..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="phase">phase</SelectItem>
                          <SelectItem value="field">field</SelectItem>
                          <SelectItem value="entityType">entityType</SelectItem>
                          <SelectItem value="source">source</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-muted-foreground">=</span>
                      <input
                        className="admin-input py-1 text-sm flex-1"
                        placeholder="value (e.g. discover)"
                        value={cond.value}
                        onChange={(e) => updateConditionValue(index, e.target.value)}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => removeCondition(index)}
                        className="p-1 px-2 border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/20"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={addCondition}
                    className="w-fit text-xs py-1"
                  >
                    + Add Condition Pair
                  </Button>
                </div>
              </div>
            </div>

            <div className="modal-footer flex gap-2 justify-end mt-4">
              <Button variant="secondary" onClick={() => {
                setNewEventType("");
                setNewSkillId("");
                setConditions([]);
                setShowAddForm(false);
              }}>
                Cancel
              </Button>
              <Button
                disabled={!newEventType || !newSkillId || createMapping.isPending}
                onClick={handleSave}
              >
                Save Route Rule
              </Button>
            </div>
          </Card>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : (
        <DataTable
          rows={mappings}
          getRowKey={(row: EventMapping) => row.id}
          minWidth={720}
          emptyTitle="No event routing rules"
          emptyDescription="No event routing rules configured."
          columns={[
            {
              key: "eventType",
              header: "Event Type",
              cell: (row: EventMapping) => (
                <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                  {row.eventType}
                </div>
              ),
            },
            {
              key: "conditions",
              header: "Conditions",
              cell: (row: EventMapping) => {
                const mappingConditions = (row.conditions ?? {}) as Record<string, string>;
                const conditionEntries = Object.entries(mappingConditions);
                return conditionEntries.length === 0 ? (
                  <span className="text-muted-foreground text-xs">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {conditionEntries.map(([k, v]) => (
                      <Badge key={k} tone="neutral" className="text-xs font-mono py-0.5 px-1.5">
                        {k}: {v}
                      </Badge>
                    ))}
                  </div>
                );
              },
            },
            {
              key: "skillId",
              header: "Target AI Skill",
              cell: (row: EventMapping) => {
                return canWrite ? (
                  <Select
                    value={row.skillId}
                    onValueChange={(val) => {
                      if (val) updateMapping.mutate({ id: row.id, skillId: val });
                    }}
                  >
                    <SelectTrigger className="max-w-xs" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredSkills.map((skill: any) => (
                        <SelectItem key={skill.id} value={skill.id}>
                          {skill.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div>
                    <span className="font-semibold block">{row.skill?.name ?? row.skillId}</span>
                    <span className="text-xs text-muted-foreground">{row.skill?.description}</span>
                  </div>
                );
              },
            },
            {
              key: "status",
              header: "Status",
              cell: (row: EventMapping) => (
                <Badge tone={row.active ? "green" : "neutral"}>
                  {row.active ? "Active" : "Disabled"}
                </Badge>
              ),
            },
            ...(canWrite
              ? [
                  {
                    key: "actions",
                    header: "Actions",
                    className: "text-right",
                    cell: (row: EventMapping) => (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => updateMapping.mutate({ id: row.id, active: !row.active })}
                        >
                          {row.active ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="p-1 px-2 border-red-200 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/20"
                          onClick={async () => {
                            const confirmed = await confirm({
                              title: "Delete Event Route",
                              description: "Are you sure you want to delete this route?",
                              confirmText: "Delete",
                              variant: "destructive"
                            });
                            if (confirmed) {
                              deleteMapping.mutate(row.id);
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}

      {!isLoading && (
        <div className="pagination-controls">
          <Button variant="secondary" onClick={() => setPage((prev) => Math.max(prev - 1, 1))} disabled={page <= 1}>
            Previous
          </Button>
          <span className="pagination-info">Page {page} of {totalPages}</span>
          <Button variant="secondary" onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))} disabled={page >= totalPages}>
            Next
          </Button>
        </div>
      )}
    </Card>
  );
}

export default AdminEventRouter;

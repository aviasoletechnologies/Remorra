import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, Plus, ShieldAlert, Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { Badge, Button, Card } from "./ui";

type Skill = {
  id: string;
  name: string;
  description: string;
};

type EventMapping = {
  id: string;
  eventType: string;
  skillId: string;
  active: boolean;
  skill: Skill;
};

export function AdminEventRouter({ canWrite }: { canWrite: boolean }) {
  const queryClient = useQueryClient();
  const { data: mappings = [], isLoading } = useQuery<EventMapping[]>({
    queryKey: ["admin-event-mappings"],
    queryFn: () => api("/admin/event-mappings"),
  });

  const { data: skillsData } = useQuery<any>({
    queryKey: ["admin-flow-skills"],
    queryFn: () => api("/admin/skills?limit=100"),
  });
  const skills = skillsData?.items ?? [];

  const [newEventType, setNewEventType] = useState("");
  const [newSkillId, setNewSkillId] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-event-mappings"] });

  const createMapping = useMutation({
    mutationFn: (body: { eventType: string; skillId: string }) =>
      api<EventMapping>("/admin/event-mappings", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      refresh();
      setNewEventType("");
      setNewSkillId("");
      setShowAddForm(false);
    },
  });

  const updateMapping = useMutation({
    mutationFn: ({ id, active, skillId }: { id: string; active?: boolean; skillId?: string }) =>
      api<EventMapping>(`/admin/event-mappings/${id}`, {
        method: "PUT",
        body: JSON.stringify({ active, skillId }),
      }),
    onSuccess: refresh,
  });

  if (isLoading) {
    return (
      <Card className="flow-builder p-6 flex justify-center items-center">
        <div className="text-muted-foreground animate-pulse flex items-center gap-2">
          <Activity className="animate-spin text-emerald-500" size={18} />
          <span>Loading event routing definitions...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flow-builder">
      <div className="flow-builder__header flex justify-between items-center mb-6">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Activity className="text-emerald-500" size={20} />
            Event Routing Configuration
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Map application-level lifecycle events to specialized AI Skills.
          </p>
        </div>
        {canWrite && !showAddForm && (
          <Button onClick={() => setShowAddForm(true)} className="flex items-center gap-2">
            <Plus size={15} /> Add Event Route
          </Button>
        )}
      </div>

      {showAddForm && (
        <div className="bg-muted/30 border border-border/50 rounded-lg p-4 mb-6 grid gap-4 transition-all duration-300">
          <h3 className="text-sm font-medium flex items-center gap-1">
            <Sparkles size={14} className="text-amber-500" />
            New Event Route Rule
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Event Name</span>
              <input
                placeholder="e.g. project.updated"
                className="admin-input"
                value={newEventType}
                onChange={(e) => setNewEventType(e.target.value)}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">Target AI Skill</span>
              <select
                className="admin-input"
                value={newSkillId}
                onChange={(e) => setNewSkillId(e.target.value)}
              >
                <option value="">Select a skill...</option>
                {skills.map((skill: any) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.name} ({skill.id})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex gap-2 justify-end mt-2">
            <Button variant="secondary" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newEventType.trim() || !newSkillId || createMapping.isPending}
              onClick={() => createMapping.mutate({ eventType: newEventType.trim(), skillId: newSkillId })}
            >
              Save Route Rule
            </Button>
          </div>
        </div>
      )}

      <div className="border border-border/45 rounded-lg overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-muted/40 border-b border-border/40 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <th className="p-4">Event Type</th>
              <th className="p-4">Target AI Skill</th>
              <th className="p-4">Status</th>
              {canWrite && <th className="p-4 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30 text-sm">
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 4 : 3} className="p-8 text-center text-muted-foreground">
                  <ShieldAlert className="mx-auto mb-2 opacity-50" size={24} />
                  No event routing rules configured.
                </td>
              </tr>
            ) : (
              mappings.map((mapping) => (
                <tr key={mapping.id} className="hover:bg-muted/10 transition-colors">
                  <td className="p-4 font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {mapping.eventType}
                  </td>
                  <td className="p-4">
                    {canWrite ? (
                      <select
                        className="admin-input py-1 text-sm max-w-xs"
                        value={mapping.skillId}
                        onChange={(e) => updateMapping.mutate({ id: mapping.id, skillId: e.target.value })}
                      >
                        {skills.map((skill: any) => (
                          <option key={skill.id} value={skill.id}>
                            {skill.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div>
                        <span className="font-semibold block">{mapping.skill?.name ?? mapping.skillId}</span>
                        <span className="text-xs text-muted-foreground">{mapping.skill?.description}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <Badge tone={mapping.active ? "green" : "neutral"}>
                      {mapping.active ? "Active" : "Disabled"}
                    </Badge>
                  </td>
                  {canWrite && (
                    <td className="p-4 text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => updateMapping.mutate({ id: mapping.id, active: !mapping.active })}
                      >
                        {mapping.active ? "Disable" : "Enable"}
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
export default AdminEventRouter;

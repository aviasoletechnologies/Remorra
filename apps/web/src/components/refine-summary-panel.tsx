import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Circle, Target, Layers, BookOpen, Users, X } from "lucide-react";
import { api } from "../lib/api";
import { Badge, Button } from "./ui";

type RefineSummary = {
  goalCount: number;
  epicCount: number;
  storyCount: number;
  personaCount: number;
  completeThreads: number;
  passCriteriaMet: boolean;
  goals: Array<{
    id: string;
    title: string;
    epics: Array<{ id: string; title: string; storyCount: number; stories: Array<{ id: string; title: string; hasAcceptance: boolean }> }>;
  }>;
  personas: Array<{ id: string; name: string; painPointCount: number }>;
};

// HARDIK doc Q12 — Live Entity Summary. Server-side, non-LLM: polls the
// Refine Summary Assembler and renders confirmed entities + linkage/pass
// criteria in real time as the conversation progresses.
export function RefineSummaryPanel({ projectId, onCollapse }: { projectId: string; onCollapse: () => void }) {
  const { data: summary, isLoading } = useQuery<RefineSummary>({
    queryKey: ["refine-summary", projectId],
    queryFn: () => api(`/workspace/projects/${projectId}/refine-summary`),
    refetchInterval: 4000,
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/70 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Layers size={16} className="text-primary" /> Live entity summary
        </div>
        <Button variant="ghost" size="icon-xs" onClick={onCollapse}>
          <X size={14} />
        </Button>
      </div>

      {isLoading || !summary ? (
        <p className="p-4 text-xs text-muted-foreground">Loading...</p>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-4 text-xs">
          <div className="rounded-lg border border-border p-2.5">
            <div className="mb-1.5 flex items-center gap-2">
              {summary.passCriteriaMet ? (
                <CheckCircle2 size={14} className="text-emerald-500" />
              ) : (
                <Circle size={14} className="text-muted-foreground" />
              )}
              <span className="font-semibold">
                {summary.passCriteriaMet ? "Pass criteria met" : "Pass criteria not yet met"}
              </span>
            </div>
            <p className="text-muted-foreground">
              {summary.completeThreads} complete Goal → Epic → Story thread{summary.completeThreads === 1 ? "" : "s"}.
              At least 1 required to continue.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border p-2 text-center">
              <Target size={14} className="mx-auto mb-1 text-primary" />
              <div className="font-semibold">{summary.goalCount}</div>
              <div className="text-[10px] text-muted-foreground">Goals</div>
            </div>
            <div className="rounded-lg border border-border p-2 text-center">
              <Layers size={14} className="mx-auto mb-1 text-primary" />
              <div className="font-semibold">{summary.epicCount}</div>
              <div className="text-[10px] text-muted-foreground">Epics</div>
            </div>
            <div className="rounded-lg border border-border p-2 text-center">
              <BookOpen size={14} className="mx-auto mb-1 text-primary" />
              <div className="font-semibold">{summary.storyCount}</div>
              <div className="text-[10px] text-muted-foreground">Stories</div>
            </div>
            <div className="rounded-lg border border-border p-2 text-center">
              <Users size={14} className="mx-auto mb-1 text-primary" />
              <div className="font-semibold">{summary.personaCount}</div>
              <div className="text-[10px] text-muted-foreground">Personas</div>
            </div>
          </div>

          {summary.goals.length > 0 ? (
            <div>
              <p className="mb-1.5 font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">Goals</p>
              <div className="space-y-2">
                {summary.goals.map((goal) => (
                  <div key={goal.id} className="rounded-lg border border-border p-2">
                    <p className="font-medium">{goal.title}</p>
                    {goal.epics.length === 0 ? (
                      <p className="mt-1 text-muted-foreground">No Epics yet.</p>
                    ) : (
                      <div className="mt-1.5 space-y-1 pl-2 border-l border-border">
                        {goal.epics.map((epic) => (
                          <div key={epic.id}>
                            <div className="flex items-center gap-1.5">
                              <span>{epic.title}</span>
                              <Badge tone={epic.storyCount > 0 ? "green" : "neutral"}>{epic.storyCount} stories</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No Goals captured yet — keep chatting to build them out.</p>
          )}

          {summary.personas.length > 0 ? (
            <div>
              <p className="mb-1.5 font-semibold uppercase tracking-wide text-[10px] text-muted-foreground">Personas</p>
              <div className="space-y-1.5">
                {summary.personas.map((persona) => (
                  <div key={persona.id} className="flex items-center justify-between rounded-lg border border-border p-2">
                    <span>{persona.name}</span>
                    <Badge tone="blue">{persona.painPointCount} pain points</Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

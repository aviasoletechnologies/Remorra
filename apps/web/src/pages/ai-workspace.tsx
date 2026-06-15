import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, LoaderCircle, MessageSquareText, Play, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Textarea } from "../components/ui";
import { api, streamTextJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { motion, AnimatePresence } from "framer-motion";

type FlowStep = {
  key: string;
  displayName: string;
  executionMode: "visible_chat" | "internal_helper" | "deterministic" | "explicit_action" | "human_review";
  position: number;
  status: "pending" | "active" | "completed" | "skipped" | "failed";
};

type WorkspaceFlow = {
  id: string;
  status: string;
  version: number;
  flow: { id: string; name: string; version: number };
  currentStep: (FlowStep & {
    description?: string;
    skillId?: string;
    skillVersion?: number;
    missingOutputs: string[];
  }) | null;
  steps: FlowStep[];
  messages: { id: string; role: "user" | "assistant"; content: string; createdAt: string }[];
};

export function AiWorkspacePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [streamedReply, setStreamedReply] = useState("");
  const [streamState, setStreamState] = useState<"idle" | "connecting" | "reconnecting" | "connected">("idle");
  const endRef = useRef<HTMLDivElement | null>(null);
  
  const { data: flow, isLoading, error } = useQuery({
    queryKey: ["workspace-flow", projectId],
    queryFn: () => api<WorkspaceFlow>(`/workspace/projects/${projectId}/flow`),
    enabled: Boolean(projectId),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [flow?.messages.length, streamedReply]);

  const send = useMutation({
    mutationFn: async () => {
      const content = message.trim();
      const job = await api<{ id: string }>(`/workspace/projects/${projectId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      setMessage("");
      setStreamedReply("");
      return new Promise<void>((resolve, reject) => {
        let stop = () => {};
        stop = streamTextJob(
          job.id,
          setStreamedReply,
          (state) => {
            if (state === "connecting" || state === "reconnecting" || state === "connected") {
              setStreamState(state);
            }
            if (state === "done") {
              stop();
              setStreamState("idle");
              resolve();
            }
            if (state === "failed") {
              stop();
              setStreamState("idle");
              reject(new Error("The guided response failed."));
            }
          },
          (streamError) => {
            stop();
            setStreamState("idle");
            reject(streamError);
          },
        );
      });
    },
    onSuccess: async () => {
      setStreamedReply("");
      await queryClient.invalidateQueries({ queryKey: ["workspace-flow", projectId] });
    },
  });

  const action = useMutation({
    mutationFn: () =>
      api(`/workspace/projects/${projectId}/actions`, {
        method: "POST",
        body: JSON.stringify({ note: message.trim() || undefined }),
      }),
    onSuccess: async (result: any) => {
      setMessage("");
      if (result?.id && result?.queue) {
        setStreamedReply("");
        await new Promise<void>((resolve, reject) => {
          let stop = () => {};
          stop = streamTextJob(result.id, setStreamedReply, (state) => {
            if (state === "done") {
              stop();
              resolve();
            } else if (state === "failed") {
              stop();
              reject(new Error("The flow action failed."));
            }
          }, reject);
        });
      }
      setStreamedReply("");
      await queryClient.invalidateQueries({ queryKey: ["workspace-flow", projectId] });
    },
  });

  if (isLoading) {
    return (
      <div className="page-container flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3 text-sm text-muted font-medium animate-pulse">
          <LoaderCircle className="animate-spin text-accent" size={24} />
          <span>Loading your guided product journey...</span>
        </div>
      </div>
    );
  }

  if (error || !flow) {
    return (
      <div className="page-container max-w-[600px] mx-auto py-12">
        <Card className="p-8 text-center border-red/20 bg-red-soft/20">
          <h1 className="text-xl font-bold text-red mb-2">Workspace unavailable</h1>
          <p className="text-sm text-muted mb-4">{error?.message ?? "The published flow could not be loaded."}</p>
          <Button variant="secondary" onClick={() => void queryClient.invalidateQueries({ queryKey: ["workspace-flow", projectId] })}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  const current = flow.currentStep;
  const completed = flow.steps.filter((step) => step.status === "completed").length;
  const canChat = current?.executionMode === "visible_chat";
  const busy = send.isPending || action.isPending;

  return (
    <div className="page-container py-8 px-6 max-w-[1440px] mx-auto flex flex-col gap-6">
      <section className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <Badge tone="green">Guided workspace</Badge>
          <h1 className="text-3xl font-bold font-sans tracking-tight text-ink mt-3 mb-1">One conversation, one skill at a time</h1>
          <p className="text-xs text-muted">
            {flow.flow.name} v{flow.flow.version}. Your run remains pinned to this published version.
          </p>
        </div>
        <Badge tone={flow.status === "completed" ? "green" : "neutral"}>
          {completed}/{flow.steps.length} complete
        </Badge>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Journey Progress Panel */}
        <Card className="col-span-12 lg:col-span-4 p-0 overflow-hidden flex flex-col">
          <div className="h-[53px] px-[17px] border-b border-border-remorra flex items-center justify-between bg-surface-2">
            <span className="flex items-center gap-2 text-xs font-bold text-ink uppercase tracking-wider">Journey</span>
            <Badge tone="neutral">v{flow.flow.version}</Badge>
          </div>
          <div className="p-4 flex flex-col gap-3 max-h-[500px] overflow-y-auto">
            {flow.steps.map((step, index) => {
              const isActive = step.status === "active";
              const isCompleted = step.status === "completed";
              
              return (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  key={step.key}
                  className={`p-3 rounded-lg border flex items-center gap-3 transition-colors duration-200 ${
                    isActive
                      ? "bg-accent-soft/30 border-accent/30 text-ink"
                      : isCompleted
                      ? "bg-surface border-border-remorra/50 opacity-90"
                      : "bg-surface border-border-remorra/30 opacity-60"
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={17} className="text-accent flex-shrink-0" />
                  ) : isActive ? (
                    <LoaderCircle size={17} className="text-accent animate-spin flex-shrink-0" />
                  ) : (
                    <Circle size={17} className="text-muted flex-shrink-0" />
                  )}
                  <div>
                    <strong className="block text-xs font-bold leading-tight">{step.displayName}</strong>
                    <small className="block text-[9px] text-muted font-medium mt-0.5">{modeLabel(step.executionMode)}</small>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </Card>

        {/* Chat / Decision Panel */}
        <Card className="col-span-12 lg:col-span-8 p-0 overflow-hidden flex flex-col shadow-lg border-border-remorra/70">
          <div className="h-[53px] px-[17px] border-b border-border-remorra flex items-center justify-between bg-surface-2">
            <span className="flex items-center gap-2 text-xs font-bold text-ink uppercase tracking-wider">
              <MessageSquareText size={17} className="text-accent" />
              <span>{current?.displayName ?? "Journey complete"}</span>
            </span>
            {current?.skillId ? (
              <Badge tone="green">
                {current.skillId} v{current.skillVersion}
              </Badge>
            ) : null}
          </div>

          {current?.missingOutputs?.length ? (
            <div className="bg-amber-soft/20 border-b border-amber-soft px-4 py-2 flex items-center justify-between text-xs">
              <strong className="text-amber uppercase tracking-wider text-[9px]">Still gathering</strong>
              <span className="text-muted font-medium truncate max-w-[400px]">
                {current.missingOutputs.map(humanize).join(", ")}
              </span>
            </div>
          ) : null}

          {/* Conversation History */}
          <div className="h-[400px] overflow-y-auto p-6 flex flex-col gap-4 bg-[#fbfcf8]" aria-live="polite">
            {flow.messages.length === 0 ? (
              <div className="flex gap-4 p-5 rounded-xl border border-accent/20 bg-accent-soft/10 text-xs my-auto max-w-[500px] mx-auto shadow-sm">
                <Sparkles size={24} className="text-accent flex-shrink-0" />
                <div className="flex flex-col gap-1">
                  <strong className="font-bold text-ink">Let’s build the product context together.</strong>
                  <p className="text-muted leading-relaxed">
                    Start by describing the product idea in your own words. The active skill will ask one focused question at a time.
                  </p>
                </div>
              </div>
            ) : null}

            {flow.messages.map((item) => {
              const isAssistant = item.role === "assistant";
              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={item.id}
                  className={`flex gap-3 max-w-[85%] ${isAssistant ? "mr-auto" : "ml-auto flex-row-reverse"}`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold flex-shrink-0 shadow-sm ${
                    isAssistant ? "bg-accent text-white" : "bg-[#43524a] text-white"
                  }`}>
                    {isAssistant ? "AI" : "ME"}
                  </div>
                  <div className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                    isAssistant
                      ? "bg-surface border-border-remorra rounded-tl-none shadow-sm text-ink"
                      : "bg-[#eef4ef] border-[#d5e2d7] rounded-tr-none text-ink"
                  }`}>
                    {item.content}
                  </div>
                </motion.div>
              );
            })}

            {streamedReply ? (
              <div className="flex gap-3 max-w-[85%] mr-auto">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold bg-accent text-white flex-shrink-0 shadow-sm">
                  AI
                </div>
                <div className="p-3.5 rounded-xl border text-xs leading-relaxed bg-surface border-border-remorra rounded-tl-none shadow-sm text-ink animate-pulse">
                  {streamedReply}
                </div>
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          {/* Action composer */}
          {current ? (
            <div className="p-4 border-t border-border-remorra bg-surface-2">
              <Textarea
                className="w-full min-h-[74px] max-h-[150px] resize-y border border-border-remorra rounded-lg p-3 bg-white outline-none text-xs leading-relaxed focus:ring-2 focus:ring-accent/20 transition-all"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={canChat ? "Answer the current question..." : "Optional note for this action..."}
                disabled={busy}
              />
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-3">
                <span className="text-[10px] text-muted leading-tight">
                  {streamState === "reconnecting"
                    ? "Connection interrupted. Resuming stream..."
                    : canChat
                    ? "Your answer is saved before AI processing."
                    : "This step runs only after your confirmation."}
                </span>
                
                {canChat ? (
                  <Button
                    className="w-full sm:w-auto"
                    disabled={busy || message.trim().length < 2}
                    onClick={() => send.mutate()}
                  >
                    {busy ? "Thinking..." : "Send answer"}
                  </Button>
                ) : (
                  <Button
                    className="w-full sm:w-auto flex items-center gap-1.5 justify-center"
                    disabled={busy}
                    onClick={() => action.mutate()}
                  >
                    <Play size={14} />
                    <span>{current.executionMode === "human_review" ? "Confirm and continue" : "Run step"}</span>
                  </Button>
                )}
              </div>
              {(send.error || action.error) ? (
                <p className="form-message mt-2 text-xs text-red">
                  {send.error?.message ?? action.error?.message}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-muted border-t border-border-remorra">
              This guided journey is complete. Confirmed product records remain available throughout the workspace.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function modeLabel(mode: FlowStep["executionMode"]) {
  return {
    visible_chat: "Guided conversation",
    internal_helper: "Background helper",
    deterministic: "Deterministic assembly",
    explicit_action: "Run on request",
    human_review: "Founder review",
  }[mode];
}

function humanize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/[-_]/g, " ").trim().toLowerCase();
}

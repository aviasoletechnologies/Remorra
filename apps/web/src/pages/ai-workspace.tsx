import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, LoaderCircle, MessageSquareText, Play, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Textarea } from "../components/ui";
import { ErrorState, LoadingState, Page, PageHeader } from "../components/app-ui";
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
  const [pendingMessages, setPendingMessages] = useState<{ id: string; role: "user"; content: string }[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  
  const { data: flow, isLoading, error } = useQuery({
    queryKey: ["workspace-flow", projectId],
    queryFn: () => api<WorkspaceFlow>(`/workspace/projects/${projectId}/flow`),
    enabled: Boolean(projectId),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [flow?.messages.length, pendingMessages.length, streamedReply]);

  const send = useMutation({
    mutationFn: async () => {
      const content = message.trim();
      const job = await api<{ id: string }>(`/workspace/projects/${projectId}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      const pendingId = globalThis.crypto.randomUUID();
      setPendingMessages((current) => [...current, { id: pendingId, role: "user", content }]);
      setMessage("");
      setStreamedReply("");
      try {
        await new Promise<void>((resolve, reject) => {
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
      } catch (error) {
        setPendingMessages((current) => current.filter((item) => item.id !== pendingId));
        throw error;
      }
    },
    onSuccess: async () => {
      setStreamedReply("");
      setPendingMessages([]);
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
    return <LoadingState label="Loading your guided product journey..." />;
  }

  if (error || !flow) {
    return (
      <Page className="max-w-3xl">
        <ErrorState
          title="Workspace unavailable"
          description={error?.message ?? "The published flow could not be loaded."}
          action={<Button variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: ["workspace-flow", projectId] })}>
            Try again
          </Button>}
        />
      </Page>
    );
  }

  const current = flow.currentStep;
  const completed = flow.steps.filter((step) => step.status === "completed").length;
  const canChat = current?.executionMode === "visible_chat";
  const busy = send.isPending || action.isPending;

  return (
    <Page>
      <PageHeader
        eyebrow="Guided workspace"
        title="One conversation, one skill at a time"
        description={`${flow.flow.name} v${flow.flow.version}. Your run remains pinned to this published version.`}
        actions={<Badge tone={flow.status === "completed" ? "green" : "neutral"}>
          {completed}/{flow.steps.length} complete
        </Badge>}
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* Journey Progress Panel */}
        <Card className="flex flex-col overflow-hidden p-0 xl:sticky xl:top-20">
          <div className="flex min-h-[58px] items-center justify-between border-b border-border bg-secondary/65 px-5">
            <span className="flex items-center gap-2 text-xs font-bold text-ink uppercase tracking-wider">Journey</span>
            <Badge tone="neutral">v{flow.flow.version}</Badge>
          </div>
          <div className="flex max-h-[280px] flex-col gap-3 overflow-y-auto p-4 xl:max-h-[calc(100vh-230px)]">
            {flow.steps.map((step, index) => {
              const isActive = step.status === "active";
              const isCompleted = step.status === "completed";
              
              return (
                <div
                  key={step.key}
                  className={`flex items-center gap-3 rounded-xl border p-3.5 transition-colors duration-200 ${
                    isActive
                      ? "border-primary/25 bg-accent-soft/50 text-ink shadow-sm"
                      : isCompleted
                      ? "border-border bg-card text-ink opacity-90"
                      : "border-border/70 bg-card/70 text-muted"
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
                </div>
              );
            })}
          </div>
        </Card>

        {/* Chat / Decision Panel */}
        <Card className="flex flex-col overflow-hidden p-0">
          <div className="flex min-h-[58px] flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/65 px-5 py-3">
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-warning/15 bg-warning-soft/35 px-5 py-3 text-xs">
              <strong className="text-amber uppercase tracking-wider text-[9px]">Still gathering</strong>
              <span className="text-muted font-medium truncate max-w-[400px]">
                {current.missingOutputs.map(humanize).join(", ")}
              </span>
            </div>
          ) : null}

          {/* Conversation History */}
          <div className="flex h-[min(58vh,620px)] min-h-[420px] flex-col gap-4 overflow-y-auto bg-background/65 p-4 sm:p-6" aria-live="polite">
            {flow.messages.length === 0 ? (
              <div className="mx-auto my-auto flex max-w-[520px] gap-4 rounded-2xl border border-primary/15 bg-accent-soft/15 p-5 text-sm shadow-sm">
                <Sparkles size={24} className="text-accent flex-shrink-0" />
                <div className="flex flex-col gap-1">
                  <strong className="font-bold text-ink">Let&apos;s build the product context together.</strong>
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
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                  key={item.id}
                  className={`flex gap-3 max-w-[85%] ${isAssistant ? "mr-auto" : "ml-auto flex-row-reverse"}`}
                >
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold flex-shrink-0 shadow-sm ${
                    isAssistant ? "bg-primary text-primary-foreground" : "bg-foreground text-background"
                  }`}>
                    {isAssistant ? "AI" : "ME"}
                  </div>
                  <div className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                    isAssistant
                      ? "bg-card border-border rounded-tl-none shadow-sm text-ink"
                      : "bg-accent-soft/70 border-primary/15 rounded-tr-none text-ink"
                  }`}>
                    {item.content}
                  </div>
                </motion.div>
              );
            })}

            {streamedReply ? (
              <div className="flex gap-3 max-w-[85%] mr-auto">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold bg-primary text-primary-foreground flex-shrink-0 shadow-sm">
                  AI
                </div>
                <div className="p-3.5 rounded-xl border text-xs leading-relaxed bg-card border-border rounded-tl-none shadow-sm text-ink">
                  {streamedReply}
                </div>
              </div>
            ) : null}
            {[...flow.messages, ...pendingMessages].map((item) => (
              <div className={`chat-message chat-message--${item.role}`} key={item.id}>{item.content}</div>
            ))}
            {streamedReply ? <div className="chat-message chat-message--assistant">{streamedReply}</div> : null}
            <div ref={endRef} />
          </div>

          {/* Action composer */}
          {current ? (
            <div className="border-t border-border bg-card p-4">
              <Textarea
                className="min-h-[92px] max-h-[150px] resize-y text-sm leading-relaxed"
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
                <p className="form-message mt-2 text-xs text-destructive">
                  {send.error?.message ?? action.error?.message}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="border-t border-border p-6 text-center text-xs text-muted">
              This guided journey is complete. Confirmed product records remain available throughout the workspace.
            </div>
          )}
        </Card>
      </div>
    </Page>
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

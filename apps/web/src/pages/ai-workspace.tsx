import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, LoaderCircle, MessageSquareText, Play, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card } from "../components/ui";
import { api, streamTextJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";

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

  if (isLoading) return <div className="page"><Card>Loading your guided product journey...</Card></div>;
  if (error || !flow) return <div className="page"><Card><h1>Workspace unavailable</h1><p>{error?.message ?? "The published flow could not be loaded."}</p></Card></div>;

  const current = flow.currentStep;
  const completed = flow.steps.filter((step) => step.status === "completed").length;
  const canChat = current?.executionMode === "visible_chat";
  const busy = send.isPending || action.isPending;

  return (
    <div className="page ai-workspace-page">
      <section className="page-heading compact-heading">
        <div>
          <Badge tone="green">Guided workspace</Badge>
          <h1>One conversation, one skill at a time</h1>
          <p>{flow.flow.name} v{flow.flow.version}. Your run remains pinned to this published version.</p>
        </div>
        <Badge tone={flow.status === "completed" ? "green" : "neutral"}>{completed}/{flow.steps.length} complete</Badge>
      </section>

      <div className="ai-workspace-grid">
        <Card className="flow-progress-panel">
          <div className="panel-heading"><span>Journey</span><Badge tone="neutral">v{flow.flow.version}</Badge></div>
          <div className="flow-step-list">
            {flow.steps.map((step) => (
              <div className={`flow-step-row flow-step-row--${step.status}`} key={step.key}>
                {step.status === "completed" ? <CheckCircle2 size={17} /> : step.status === "active" ? <LoaderCircle size={17} /> : <Circle size={17} />}
                <div><strong>{step.displayName}</strong><small>{modeLabel(step.executionMode)}</small></div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="unified-chat-panel">
          <div className="panel-heading">
            <span><MessageSquareText size={17} />{current?.displayName ?? "Journey complete"}</span>
            {current?.skillId ? <Badge tone="green">{current.skillId} v{current.skillVersion}</Badge> : null}
          </div>
          {current?.missingOutputs?.length ? (
            <div className="missing-output-strip">
              <strong>Still gathering</strong>
              <span>{current.missingOutputs.map(humanize).join(", ")}</span>
            </div>
          ) : null}
          <div className="conversation unified-conversation" aria-live="polite">
            {flow.messages.length === 0 ? (
              <div className="assistant-intro">
                <Sparkles size={20} />
                <div>
                  <strong>Let’s build the product context together.</strong>
                  <p>Start by describing the product idea in your own words. The active skill will ask one focused question at a time.</p>
                </div>
              </div>
            ) : null}
            {[...flow.messages, ...pendingMessages].map((item) => (
              <div className={`chat-message chat-message--${item.role}`} key={item.id}>{item.content}</div>
            ))}
            {streamedReply ? <div className="chat-message chat-message--assistant">{streamedReply}</div> : null}
            <div ref={endRef} />
          </div>
          {current ? (
            <div className="unified-composer">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={canChat ? "Answer the current question..." : "Optional note for this action..."}
                disabled={busy}
              />
              <div className="unified-composer__footer">
                <span>{streamState === "reconnecting" ? "Connection interrupted. Resuming stream..." : canChat ? "Your answer is saved before AI processing." : "This step runs only after your confirmation."}</span>
                {canChat ? (
                  <Button disabled={busy || message.trim().length < 2} onClick={() => send.mutate()}>
                    {busy ? "Thinking..." : "Send answer"}
                  </Button>
                ) : (
                  <Button disabled={busy} onClick={() => action.mutate()}>
                    <Play size={15} />{current.executionMode === "human_review" ? "Confirm and continue" : "Run step"}
                  </Button>
                )}
              </div>
              {(send.error || action.error) ? <p className="form-message">{send.error?.message ?? action.error?.message}</p> : null}
            </div>
          ) : (
            <div className="empty-state">This guided journey is complete. Confirmed product records remain available throughout the workspace.</div>
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

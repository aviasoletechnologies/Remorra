import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Textarea } from "../components/ui";
import { ErrorState, LoadingState, Page, PageHeader } from "../components/app-ui";
import { api, streamTextJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { motion } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";

type WorkspaceActiveSkill = {
  id: string;
  name: string;
  description: string;
  version: number;
  versionId: string;
};

type WorkspaceConversation = {
  id: string;
  status: string;
  activeSkill: WorkspaceActiveSkill | null;
  messages: { id: string; role: "user" | "assistant"; content: string; createdAt: string }[];
};

type PendingMessage = { id: string; role: "user"; content: string };

export function AiWorkspacePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [streamedReply, setStreamedReply] = useState("");
  const [streamState, setStreamState] = useState<"idle" | "connecting" | "reconnecting" | "connected">("idle");
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [pickedSkill, setPickedSkill] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const { data: conversation, isLoading, error } = useQuery({
    queryKey: ["workspace-flow", projectId],
    queryFn: () => api<WorkspaceConversation>(`/workspace/projects/${projectId}/flow`),
    enabled: Boolean(projectId),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [conversation?.messages.length, pendingMessages.length, streamedReply]);

  const send = useMutation({
    mutationFn: async () => {
      const content = message.trim();
      if (!content) {
        return { id: null as string | null };
      }

      const pendingId = globalThis.crypto.randomUUID();
      setPendingMessages((current) => [...current, { id: pendingId, role: "user", content }]);
      setMessage("");
      setStreamedReply("");
      setLiveLogs(["Sending message to API...", "Routing event..."]);
      setPickedSkill(null);

      try {
        const result = await api<{ id: string | null }>(`/workspace/projects/${projectId}/messages`, {
          method: "POST",
          body: JSON.stringify({ content }),
        });

        const jobId = result.id;
        if (jobId) {
          await new Promise<void>((resolve, reject) => {
            let stop = () => {};
            stop = streamTextJob(
              jobId,
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
                  reject(new Error("The routed response failed."));
                }
              },
              (streamError) => {
                stop();
                setStreamState("idle");
                reject(streamError);
              },
              (event) => {
                if (event.type === "log" && typeof event.delta === "string") {
                  const logText = event.delta;
                  setLiveLogs((current) => [...current, logText]);
                }
                if (event.type === "info" && typeof event.delta === "string") {
                  setPickedSkill(event.delta);
                }
              }
            );
          });
        }

        return { ...result, pendingId };
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
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-flow", projectId] });
    },
  });

  const resetWorkspace = useMutation({
    mutationFn: async () => {
      if (!projectId) {
        throw new Error("No active project selected.");
      }
      return api(`/projects/${projectId}/reset-workspace`, { method: "POST" });
    },
    onSuccess: async () => {
      setMessage("");
      setStreamedReply("");
      setPendingMessages([]);
      setLiveLogs([]);
      setPickedSkill(null);
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace-flow", projectId] });
    },
  });

  if (isLoading) {
    return <LoadingState label="Loading your workspace..." />;
  }

  if (error || !conversation) {
    return (
      <Page className="max-w-3xl">
        <ErrorState
          title="Workspace unavailable"
          description={error?.message ?? "The workspace conversation could not be loaded."}
          action={(
            <Button variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: ["workspace-flow", projectId] })}>
              Try again
            </Button>
          )}
        />
      </Page>
    );
  }

  const activeSkill = conversation.activeSkill;
  const busy = send.isPending;
  const visibleMessages = [...conversation.messages, ...pendingMessages];
  const placeholder = activeSkill
    ? `Ask about ${activeSkill.name.toLowerCase()}...`
    : "Describe your product idea or ask a normal question...";

  return (
    <Page>
      <PageHeader
        eyebrow="Intent routed workspace"
        title="One conversation, one skill at a time"
        description="The first clear message activates the best matching skill. If nothing matches yet, the conversation continues normally and the router keeps checking each new message."
        actions={(
          <div className="flex items-center gap-2">
            <Badge tone={activeSkill ? "green" : "neutral"}>
              {activeSkill ? `${activeSkill.name} v${activeSkill.version}` : "Awaiting intent"}
            </Badge>
            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="outline" size="sm" className="border-amber-500/25 text-amber-700 hover:bg-amber-500/10 hover:text-amber-800" />}
              >
                <RotateCcw size={14} />
                Reset workspace
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset this workspace?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This clears the current project conversation, pinned skill, generated workspace data, and related AI job history. The project itself will stay in place.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-amber-600 text-white hover:bg-amber-700"
                    onClick={() => resetWorkspace.mutate()}
                  >
                    {resetWorkspace.isPending ? "Resetting..." : "Reset now"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="flex flex-col overflow-hidden p-0 xl:sticky xl:top-20">
          <div className="flex min-h-[58px] items-center justify-between border-b border-border bg-secondary/65 px-5">
            <span className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">Skill router</span>
            <Badge tone={activeSkill ? "green" : "neutral"}>{activeSkill ? "Pinned" : "Idle"}</Badge>
          </div>
          <div className="flex flex-col gap-4 p-5">
            {activeSkill ? (
              <>
                <div className="rounded-2xl border border-primary/15 bg-accent-soft/20 p-4 shadow-sm">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active skill</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <strong className="text-sm text-foreground">{activeSkill.name}</strong>
                    <Badge tone="neutral">v{activeSkill.version}</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{activeSkill.description}</p>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Future messages will skip intent routing and go straight to this skill until the conversation is reset.
                </p>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card/70 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Sparkles size={16} className="text-primary" />
                  Skill not selected yet
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Send a clear product idea or request. If nothing matches yet, Remorra will still reply normally and keep checking future messages for a better skill match.
                </p>
              </div>
            )}

            {liveLogs.length > 0 && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-inner font-mono text-[10px] text-zinc-300">
                <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">SSE Live Log</span>
                  {streamState !== "idle" && (
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  )}
                </div>
                {pickedSkill && (
                  <div className="mb-2 text-emerald-400 font-semibold flex items-center gap-1.5">
                    <span className="text-zinc-500">&gt;</span> Picked: {pickedSkill}
                  </div>
                )}
                <div className="max-h-[140px] overflow-y-auto space-y-1">
                  {liveLogs.map((log, idx) => (
                    <div key={idx} className="flex gap-1.5 leading-relaxed">
                      <span className="text-zinc-500 flex-shrink-0">&gt;</span>
                      <span>{log}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="flex flex-col overflow-hidden p-0">
          <div className="flex min-h-[58px] flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/65 px-5 py-3">
            <span className="flex items-center gap-2 text-xs font-bold text-foreground uppercase tracking-wider">
              <MessageSquareText size={17} className="text-primary" />
              <span>{activeSkill ? activeSkill.name : "Waiting for the first intent"}</span>
            </span>
            {activeSkill ? (
              <Badge tone="green">
                {activeSkill.id}
              </Badge>
            ) : (
              <Badge tone="neutral">No active skill</Badge>
            )}
          </div>

          <div className="flex h-[min(58vh,620px)] min-h-[420px] flex-col gap-4 overflow-y-auto bg-background/65 p-4 sm:p-6" aria-live="polite">
            {visibleMessages.length === 0 ? (
              <div className="mx-auto my-auto flex max-w-[520px] gap-4 rounded-2xl border border-primary/15 bg-accent-soft/15 p-5 text-sm shadow-sm">
                <Sparkles size={24} className="text-primary flex-shrink-0" />
                <div className="flex flex-col gap-1">
                  <strong className="font-bold text-foreground">Start with what you want to build.</strong>
                  <p className="text-muted-foreground leading-relaxed">
                    The router will read your first message, compare it against the active skill descriptions, and either activate the best match or continue the conversation normally.
                  </p>
                </div>
              </div>
            ) : null}

            {visibleMessages.map((item) => {
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
                      ? "bg-card border-border rounded-tl-none shadow-sm text-foreground"
                      : "bg-accent-soft/70 border-primary/15 rounded-tr-none text-foreground"
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
                <div className="p-3.5 rounded-xl border text-xs leading-relaxed bg-card border-border rounded-tl-none shadow-sm text-foreground">
                  {streamedReply}
                </div>
              </div>
            ) : null}

            <div ref={endRef} />
          </div>

          <div className="border-t border-border bg-card p-4">
            <Textarea
              className="min-h-[92px] max-h-[150px] resize-y text-sm leading-relaxed"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={placeholder}
              disabled={busy}
            />
            <div className="mt-3 flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
              <span className="text-[10px] text-muted-foreground leading-tight">
                {streamState === "reconnecting"
                  ? "Connection interrupted. Resuming stream..."
                  : activeSkill
                  ? "Your message will continue through the pinned skill."
                  : "The router will select the first matching skill for this conversation."}
              </span>
              <Button
                className="w-full sm:w-auto"
                disabled={busy || message.trim().length < 2}
                onClick={() => send.mutate()}
              >
                {busy ? "Thinking..." : "Send"}
              </Button>
            </div>
            {send.error ? (
              <p className="form-message mt-2 text-xs text-destructive">
                {send.error.message}
              </p>
            ) : null}
            {resetWorkspace.error ? (
              <p className="form-message mt-2 text-xs text-destructive">
                {resetWorkspace.error.message}
              </p>
            ) : null}
          </div>
        </Card>
      </div>
    </Page>
  );
}

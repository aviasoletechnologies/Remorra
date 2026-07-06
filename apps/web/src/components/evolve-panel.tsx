import { useMemo, useRef, useState, useEffect, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { Sparkles, Send, Check, X, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, waitForJob } from "../lib/api";
import { cn } from "../lib/utils";
import { Button, Badge, Card } from "./ui";
import { useConfirm } from "./confirm-dialog";

type EvolveSession = {
  id: string;
  launchedFrom: string;
  topic: string | null;
  status: "active" | "draft" | "screening" | "completed" | "nav_away";
  createdAt: string;
};

type EvolveMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
};

type ImpactItem = {
  id: string;
  affectedEntityType: string;
  affectedEntityId: string | null;
  severity: "red" | "amber" | "green";
  title: string;
  reasoning: string;
  status: "pending" | "confirmed" | "rejected";
};

type EvolveAction = {
  id: string;
  entityType: string;
  entityId: string | null;
  actionType: string;
  proposedChange: Record<string, unknown>;
  requiresScreening: boolean;
  status: "pending" | "confirmed" | "rejected";
  createdAt: string;
  impactItems: ImpactItem[];
};

type ContextProposal = {
  id: string;
  proposedText: string;
  source: "layer1" | "layer2" | "layer3";
  status: "pending" | "confirmed" | "rejected";
  createdAt: string;
};

const sourceLabel: Record<ContextProposal["source"], string> = {
  layer1: "Auto-detected",
  layer2: "From Evolve",
  layer3: "Drift review",
};

const severityTone: Record<string, "red" | "amber" | "green"> = { red: "red", amber: "amber", green: "green" };

export function EvolvePanel({ projectId, onClose, headerExtra }: { projectId: string; onClose?: () => void; headerExtra?: ReactNode }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const confirm = useConfirm();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentSessionStatus, setCurrentSessionStatus] = useState<EvolveSession["status"] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const { data: sessions = [] } = useQuery({
    queryKey: ["evolve-sessions", projectId],
    queryFn: () => api<EvolveSession[]>(`/projects/${projectId}/evolve/sessions`),
  });

  const createSession = useMutation({
    mutationFn: () =>
      api<EvolveSession>(`/projects/${projectId}/evolve/sessions`, {
        method: "POST",
        body: JSON.stringify({ launchedFrom: location.pathname }),
      }),
    onSuccess: (session) => {
      setSessionId(session.id);
      setCurrentSessionStatus(session.status);
      queryClient.invalidateQueries({ queryKey: ["evolve-sessions", projectId] });
    },
    onError: (err: any) => toast.error(err?.message || "Failed to start Evolve session."),
  });

  const { data: messages = [] } = useQuery({
    queryKey: ["evolve-messages", sessionId],
    queryFn: () => api<EvolveMessage[]>(`/projects/${projectId}/evolve/sessions/${sessionId}/messages`),
    enabled: !!sessionId,
  });

  // Page mode has no explicit Close button (nothing to "close") — instead,
  // auto-save an active session as a Draft when navigating away, so work
  // isn't silently lost. Refs avoid the stale-closure problem in unmount cleanup.
  const autoSaveRef = useRef({ projectId, sessionId, currentSessionStatus, messageCount: messages.length });
  autoSaveRef.current = { projectId, sessionId, currentSessionStatus, messageCount: messages.length };
  useEffect(() => {
    if (onClose) return; // panel mode already has its own explicit close-time save prompt
    return () => {
      const { projectId: pid, sessionId: sid, currentSessionStatus: status, messageCount } = autoSaveRef.current;
      if (sid && status === "active" && messageCount > 0) {
        void api(`/projects/${pid}/evolve/sessions/${sid}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "draft" }),
        }).catch(() => undefined);
      }
    };
  }, [onClose]);

  const { data: actions = [] } = useQuery({
    queryKey: ["evolve-actions", sessionId],
    queryFn: () => api<EvolveAction[]>(`/projects/${projectId}/evolve/sessions/${sessionId}/actions`),
    enabled: !!sessionId,
    refetchInterval: sessionId ? 4000 : false,
  });

  const { data: contextProposals = [] } = useQuery({
    queryKey: ["evolve-context-proposals", projectId],
    queryFn: () => api<ContextProposal[]>(`/projects/${projectId}/evolve/context-proposals`),
    refetchInterval: 6000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const pendingActions = useMemo(() => actions.filter((a) => a.status === "pending"), [actions]);

  const send = async () => {
    const content = draft.trim();
    if (!content || !sessionId || sending) return;
    setSending(true);
    setDraft("");
    setCurrentSessionStatus((status) => (status === "draft" ? "active" : status));
    try {
      const { job } = await api<{ job: { id: string } }>(
        `/projects/${projectId}/evolve/sessions/${sessionId}/messages`,
        { method: "POST", body: JSON.stringify({ content }) },
      );
      await waitForJob(job.id);
      queryClient.invalidateQueries({ queryKey: ["evolve-messages", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["evolve-actions", sessionId] });
      queryClient.invalidateQueries({ queryKey: ["evolve-context-proposals", projectId] });
    } catch (err: any) {
      toast.error(err?.message || "Evolve failed to respond.");
    } finally {
      setSending(false);
    }
  };

  const decideImpactItem = useMutation({
    mutationFn: ({ actionId, itemId, decision }: { actionId: string; itemId: string; decision: "confirmed" | "rejected" }) =>
      api(`/projects/${projectId}/evolve/actions/${actionId}/impact-items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["evolve-actions", sessionId] }),
    onError: (err: any) => toast.error(err?.message || "Failed to record impact item decision."),
  });

  const approveAction = useMutation({
    mutationFn: (actionId: string) => api(`/projects/${projectId}/evolve/actions/${actionId}/approve`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["evolve-actions", sessionId] }),
    onError: (err: any) => toast.error(err?.message || "Failed to approve action."),
  });

  const rejectAction = useMutation({
    mutationFn: (actionId: string) => api(`/projects/${projectId}/evolve/actions/${actionId}/reject`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["evolve-actions", sessionId] }),
    onError: (err: any) => toast.error(err?.message || "Failed to reject action."),
  });

  const decideContextProposal = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) =>
      api(`/projects/${projectId}/evolve/context-proposals/${id}/${decision}`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["evolve-context-proposals", projectId] }),
    onError: (err: any) => toast.error(err?.message || "Failed to update context proposal."),
  });

  const closeSession = async () => {
    if (sessionId && currentSessionStatus === "active" && messages.length > 0) {
      const saveDraft = await confirm({
        title: "Save this Evolve session?",
        description: "This session is still active. Save it as a Draft to resume later, or keep it active and continue now.",
        confirmText: "Save as Draft",
        cancelText: "Keep Active",
      });
      if (saveDraft) {
        await api(`/projects/${projectId}/evolve/sessions/${sessionId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "draft" }),
        });
        setCurrentSessionStatus("draft");
        queryClient.invalidateQueries({ queryKey: ["evolve-sessions", projectId] });
      }
    }
    onClose?.();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 p-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles size={16} className="text-primary" /> Evolve
        </div>
        <div className="flex items-center gap-1">
          {headerExtra}
          <Button variant="ghost" size="icon-xs" onClick={() => setShowHistory((v) => !v)} title="Session history">
            <History size={14} />
          </Button>
          {onClose ? (
            <Button variant="ghost" size="icon-xs" onClick={closeSession} title="Close">
              <X size={14} />
            </Button>
          ) : null}
        </div>
      </div>

      {contextProposals.length > 0 ? (
        <div className="border-b border-border/70 bg-accent-soft/40 p-3 space-y-2">
          {contextProposals.map((proposal) => (
            <div key={proposal.id} className="rounded-lg border border-border bg-card p-2 text-xs">
              <div className="mb-1 flex items-center gap-2">
                <Badge tone="blue">{sourceLabel[proposal.source]}</Badge>
              </div>
              <p className="mb-2">Add to project context: <strong>{proposal.proposedText}</strong></p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => decideContextProposal.mutate({ id: proposal.id, decision: "approve" })}>
                  <Check size={12} /> Add
                </Button>
                <Button size="sm" variant="outline" onClick={() => decideContextProposal.mutate({ id: proposal.id, decision: "reject" })}>
                  <X size={12} /> Dismiss
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {showHistory ? (
        <div className="border-b border-border/70 p-3 max-h-48 overflow-y-auto space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Past sessions</p>
          {sessions.filter((s) => s.status === "draft" || s.status === "completed").map((session) => (
            <button
              key={session.id}
              onClick={() => {
                setSessionId(session.id);
                setCurrentSessionStatus(session.status);
                setShowHistory(false);
              }}
              className="flex w-full items-center justify-between rounded-lg border border-border p-2 text-left text-xs hover:bg-secondary/50"
            >
              <span className="truncate">{session.topic ?? session.launchedFrom}</span>
              <Badge tone={session.status === "completed" ? "green" : "amber"}>{session.status}</Badge>
            </button>
          ))}
          {sessions.length === 0 ? <p className="text-xs text-muted-foreground">No past sessions yet.</p> : null}
        </div>
      ) : null}

      {!sessionId ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Ask Evolve to help evolve your strategy, screen goal changes, or generate documents.
          </p>
          <Button onClick={() => createSession.mutate()} disabled={createSession.isPending}>
            {createSession.isPending ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
            Start Evolve session
          </Button>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed",
                  message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-secondary/60",
                )}
              >
                {message.content}
              </div>
            ))}

            {pendingActions.map((action) => (
              <Card key={action.id} className="p-3 text-xs space-y-2 border-primary/30">
                <p className="font-semibold">
                  Proposed {action.actionType} on {action.entityType}
                </p>
                <pre className="whitespace-pre-wrap rounded bg-secondary/40 p-2 text-[10px]">
                  {JSON.stringify(action.proposedChange, null, 2)}
                </pre>

                {action.requiresScreening ? (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Impact assessment
                    </p>
                    {action.impactItems.length === 0 ? (
                      <p className="text-muted-foreground">Screening in progress...</p>
                    ) : (
                      action.impactItems.map((item) => (
                        <div key={item.id} className="rounded-lg border border-border p-2 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{item.title}</span>
                            <Badge tone={severityTone[item.severity] ?? "neutral"}>{item.severity}</Badge>
                          </div>
                          <p className="text-muted-foreground">{item.reasoning}</p>
                          {item.status === "pending" ? (
                            <div className="flex gap-2 pt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  decideImpactItem.mutate({ actionId: action.id, itemId: item.id, decision: "confirmed" })
                                }
                              >
                                Accept
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  decideImpactItem.mutate({ actionId: action.id, itemId: item.id, decision: "rejected" })
                                }
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <Badge tone={item.status === "confirmed" ? "green" : "red"}>{item.status}</Badge>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}

                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={() => approveAction.mutate(action.id)} disabled={approveAction.isPending}>
                    <Check size={12} /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => rejectAction.mutate(action.id)} disabled={rejectAction.isPending}>
                    <X size={12} /> Reject
                  </Button>
                </div>
              </Card>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex items-center gap-2 border-t border-border/70 p-3">
            <input
              className="h-9 flex-1 rounded-lg border border-input bg-card px-3 text-xs outline-none focus:ring-2 focus:ring-ring/20"
              placeholder="Ask Evolve..."
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              disabled={sending}
            />
            <Button size="icon" onClick={() => void send()} disabled={sending || !draft.trim()}>
              {sending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

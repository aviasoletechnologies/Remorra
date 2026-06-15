import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, GitCompareArrows, MessageSquareText, ShieldCheck, LoaderCircle, X, ChevronDown, CircleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Input, Textarea } from "../components/ui";
import { api, waitForJob, streamTextJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { motion, AnimatePresence } from "framer-motion";

type ChatItem = { role: "user" | "assistant"; content: string };

export function EvolvePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"ideate" | "publish">("ideate");
  const [topic, setTopic] = useState("");
  const [session, setSession] = useState<any>(null);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatItem[]>([]);
  
  const storedSessionId = projectId
    ? window.localStorage.getItem(`remorra:evolve:${projectId}`)
    : null;

  const { data: restoredSession } = useQuery({
    queryKey: ["evolve-session", storedSessionId],
    queryFn: () => api<any>(`/evolve/sessions/${storedSessionId}`),
    enabled: Boolean(storedSessionId && !session),
    retry: false,
  });

  useEffect(() => {
    if (restoredSession && !session) setSession(restoredSession);
  }, [restoredSession, session]);

  useEffect(() => {
    if (session?.messages) {
      setChat(
        session.messages.map((item: any) => ({
          role: item.role,
          content: item.content,
        })),
      );
    }
  }, [session?.messages]);

  const create = useMutation({
    mutationFn: () => api<any>("/evolve/sessions", { method: "POST", body: JSON.stringify({ projectId, mode, topic, launchedFrom: window.location.pathname }) }),
    onSuccess: (created) => {
      setSession(created);
      window.localStorage.setItem(`remorra:evolve:${projectId}`, created.id);
    },
  });

  const [streamState, setStreamState] = useState<"idle" | "connecting" | "reconnecting" | "connected" | "done" | "failed">("idle");
  
  const send = useMutation({
    mutationFn: async () => {
      const content = message.trim();
      const job = await api<{ id: string }>(`/evolve/sessions/${session.id}/messages`, { method: "POST", body: JSON.stringify({ content }) });
      setChat((items) => [...items, { role: "user", content }, { role: "assistant", content: "" }]);
      setMessage("");
      return new Promise<void>((resolve, reject) => {
        const unsubscribe = streamTextJob(
          job.id,
          (text) => {
            setChat((items) => items.map((item, index) => index === items.length - 1 ? { ...item, content: text } : item));
          },
          (state) => {
            setStreamState(state);
            if (state === "done") {
              setStreamState("idle");
              unsubscribe();
              resolve();
            } else if (state === "failed") {
              setStreamState("idle");
              unsubscribe();
              reject(new Error("Streaming failed"));
            }
          },
          (err) => {
            setStreamState("idle");
            unsubscribe();
            reject(err);
          }
        );
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["evolve-session", session.id] });
    },
  });

  const screen = useMutation({
    mutationFn: async () => {
      const job = await api<{ id: string }>(`/evolve/sessions/${session.id}/screen`, { method: "POST" });
      return waitForJob(job.id);
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["evolve-session", session.id] }),
  });

  const decide = useMutation({
    mutationFn: ({ impactId, decision }: { impactId: string; decision: "approved" | "rejected" }) =>
      api(`/evolve/sessions/${session.id}/impacts/${impactId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["evolve-session", session.id] }),
  });

  const resolve = useMutation({
    mutationFn: ({
      impactId,
      resolution,
      note,
      payload,
    }: {
      impactId: string;
      resolution: string;
      note?: string;
      payload?: any;
    }) =>
      api<any>(`/evolve/sessions/${session.id}/impacts/${impactId}/resolve`, {
        method: "POST",
        body: JSON.stringify({ resolution, note, payload }),
      }),
    onSuccess: (updatedSession) => {
      setSession(updatedSession);
      setSelectedImpactId(null);
      void queryClient.invalidateQueries({ queryKey: ["evolve-session", session.id] });
    },
  });

  const complete = useMutation({
    mutationFn: () =>
      api<any>(`/evolve/sessions/${session.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ currentProjectVersion: session.baseProjectVersion }),
      }),
    onSuccess: (result) => {
      setSession((value: any) => ({ ...value, status: "completed", baseProjectVersion: result.projectVersion }));
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const impacts =
    restoredSession && restoredSession.id === session?.id
      ? restoredSession.impacts ?? []
      : session?.impacts ?? [];

  const [selectedImpactId, setSelectedImpactId] = useState<string | null>(null);
  const [resolutionType, setResolutionType] = useState<"accept" | "keep_current" | "edit_payload" | "retarget" | "split" | "reject">("accept");
  const [editPayloadStr, setEditPayloadStr] = useState("");
  const [retargetId, setRetargetId] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");

  useEffect(() => {
    if (selectedImpactId) {
      const selected = impacts.find((item: any) => item.id === selectedImpactId);
      if (selected) {
        setResolutionType((selected.resolution as any) || "accept");
        const change = selected.resolvedPayload ?? selected.proposedChange;
        setEditPayloadStr(JSON.stringify(change?.data ?? {}, null, 2));
        setRetargetId(selected.entityId || "");
        setResolutionNote(selected.resolutionNote || "");
      }
    }
  }, [selectedImpactId, impacts]);

  const getStatusLabelAndTone = (impact: any) => {
    if (impact.decision === "approved") return { label: "Approved", tone: "green" as const };
    if (impact.decision === "rejected") return { label: "Rejected", tone: "red" as const };
    if (impact.status === "conflict") return { label: "Conflict", tone: "amber" as const };
    if (impact.status === "blocked") return { label: "Blocked", tone: "red" as const };
    if (impact.status === "resolved") return { label: "Resolved", tone: "blue" as const };
    return { label: "Ready", tone: "neutral" as const };
  };

  return (
    <div className="page-container py-8 px-6 max-w-[1440px] mx-auto flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <div>
          <Badge tone="amber">Founder controlled change</Badge>
          <h1 className="text-3xl font-bold font-sans tracking-tight text-ink mt-3 mb-1">Evolve with confidence</h1>
          <p className="text-sm text-muted">
            Explore consequences, screen linked impacts, and approve changes before they become product history.
          </p>
        </div>
      </section>

      {!session ? (
        <Card className="max-w-[760px] p-8 flex flex-col gap-6 mx-auto shadow-md border-border-remorra/80">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-amber-soft text-amber flex items-center justify-center shadow-inner">
              <GitCompareArrows size={24} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">Start a change session</h2>
              <p className="text-xs text-muted">Initialize impact screening for structural project updates.</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted font-bold tracking-wide uppercase">Topic</label>
            <Input
              className="w-full h-11 border border-border-remorra rounded-lg bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="What product decision or change are you considering?"
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs text-muted font-bold tracking-wide uppercase">Mode</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                className={`p-4 rounded-xl border text-left flex gap-3 transition-all ${
                  mode === "ideate"
                    ? "border-accent bg-accent-soft/30 text-ink shadow-sm"
                    : "border-border-remorra bg-surface hover:bg-[#f8faf7]"
                }`}
                onClick={() => setMode("ideate")}
              >
                <MessageSquareText size={18} className="text-accent mt-0.5 flex-shrink-0" />
                <div>
                  <strong className="block text-xs font-bold">Ideate</strong>
                  <span className="block text-[10px] text-muted leading-relaxed mt-0.5">
                    Discuss and shape the change first.
                  </span>
                </div>
              </button>
              
              <button
                className={`p-4 rounded-xl border text-left flex gap-3 transition-all ${
                  mode === "publish"
                    ? "border-accent bg-accent-soft/30 text-ink shadow-sm"
                    : "border-border-remorra bg-surface hover:bg-[#f8faf7]"
                }`}
                onClick={() => setMode("publish")}
              >
                <ShieldCheck size={18} className="text-accent mt-0.5 flex-shrink-0" />
                <div>
                  <strong className="block text-xs font-bold">Publish</strong>
                  <span className="block text-[10px] text-muted leading-relaxed mt-0.5">
                    No chat. Go directly to impact screening.
                  </span>
                </div>
              </button>
            </div>
          </div>

          <Button
            className="w-full mt-2"
            disabled={topic.trim().length < 3 || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? "Starting..." : `Start ${mode} session`}
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: Chat/Info Panel */}
          <Card className="col-span-12 lg:col-span-5 p-0 overflow-hidden flex flex-col shadow-lg border-border-remorra/70">
            <div className="h-[53px] px-[17px] border-b border-border-remorra flex items-center justify-between bg-surface-2">
              <span className="flex items-center gap-2 text-xs font-bold text-ink uppercase tracking-wider">
                <MessageSquareText size={17} className="text-accent" />
                <span>{session.mode} session</span>
              </span>
              <Badge tone="neutral">{session.status}</Badge>
            </div>
            
            <div className="h-[360px] overflow-y-auto p-5 flex flex-col gap-4 bg-[#fbfcf8]">
              {session.mode === "publish" ? (
                <div className="flex flex-col items-center justify-center text-center my-auto p-6 max-w-[300px] mx-auto text-muted">
                  <ShieldCheck size={24} className="text-accent mb-2" />
                  <p className="text-xs leading-relaxed">
                    Publish mode intentionally has no conversation. Run impact screening now.
                  </p>
                </div>
              ) : (
                <>
                  {chat.map((item, index) => {
                    const isAssistant = item.role === "assistant";
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={`${item.role}-${index}`}
                        className={`flex gap-3 max-w-[85%] ${isAssistant ? "mr-auto" : "ml-auto flex-row-reverse"}`}
                      >
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold flex-shrink-0 shadow-sm ${
                          isAssistant ? "bg-accent text-white" : "bg-[#43524a] text-white"
                        }`}>
                          {isAssistant ? "AI" : "ME"}
                        </div>
                        <div className={`p-3 rounded-xl border text-xs leading-relaxed ${
                          isAssistant
                            ? "bg-surface border-border-remorra rounded-tl-none shadow-sm text-ink"
                            : "bg-[#eef4ef] border-[#d5e2d7] rounded-tr-none text-ink"
                        }`}>
                          {item.content}
                        </div>
                      </motion.div>
                    );
                  })}
                </>
              )}
            </div>

            {session.mode !== "publish" && (
              <div className="p-4 border-t border-border-remorra bg-surface-2">
                <Textarea
                  className="w-full min-h-[74px] max-h-[140px] resize-y border border-border-remorra rounded-lg p-3 bg-white outline-none text-xs leading-relaxed focus:ring-2 focus:ring-accent/20 transition-all mb-3"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Discuss the intended outcome, evidence, assumptions, and tradeoffs..."
                  disabled={send.isPending || session.status === "completed"}
                />
                <div className="flex items-center gap-3">
                  <Button
                    disabled={message.trim().length < 2 || send.isPending || session.status === "completed"}
                    onClick={() => send.mutate()}
                  >
                    {streamState === "connecting"
                      ? "Connecting..."
                      : streamState === "reconnecting"
                      ? "Reconnecting..."
                      : send.isPending
                      ? "Thinking..."
                      : "Send to Evolve"}
                  </Button>
                  {streamState === "reconnecting" && (
                    <span className="text-[10px] text-muted font-medium">Network drop. Reconnecting...</span>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Right: Consequence Screening Grid */}
          <div className="col-span-12 lg:col-span-7 flex flex-col gap-4">
            <Card className="p-5 flex items-center justify-between shadow-sm border-border-remorra/85 bg-surface">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-accent-soft text-accent flex items-center justify-center shadow-sm">
                  <GitCompareArrows size={20} />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-muted uppercase tracking-wider block">Impact workflow</span>
                  <h2 className="text-base font-bold text-ink mt-0.5">Screen every linked consequence</h2>
                </div>
              </div>
              <Badge tone="green">
                <ShieldCheck size={13} className="mr-1 inline" />
                <span>Atomic approval</span>
              </Badge>
            </Card>

            <Card className="p-5 flex items-center justify-between border-border-remorra/80 shadow-sm">
              <div>
                <h3 className="text-sm font-bold text-ink">{impacts.length ? `${impacts.length} linked impacts` : "Ready to screen"}</h3>
                <p className="text-xs text-muted max-w-[360px] leading-relaxed mt-1">
                  Screening creates proposals only. Product records change together after every item has a founder decision.
                </p>
              </div>
              <Button
                variant="secondary"
                disabled={screen.isPending || session.status === "completed"}
                onClick={() => screen.mutate()}
                className="flex items-center gap-1.5 flex-shrink-0"
              >
                {screen.isPending ? (
                  <LoaderCircle size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                <span>{screen.isPending ? "Screening..." : impacts.length ? "Screen again" : "Run screening"}</span>
              </Button>
            </Card>

            <div className="flex flex-col gap-3">
              <AnimatePresence>
                {impacts.map((impact: any, idx: number) => {
                  const isSelected = selectedImpactId === impact.id;
                  const statusInfo = getStatusLabelAndTone(impact);
                  
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ delay: idx * 0.05 }}
                      key={impact.id}
                    >
                      <Card className={`p-4 shadow-sm transition-all duration-200 border bg-surface ${
                        impact.severity === "red"
                          ? "border-red/30 bg-red-soft/10"
                          : impact.severity === "green"
                          ? "border-accent/30 bg-accent-soft/10"
                          : "border-amber/30 bg-amber-soft/10"
                      }`}>
                        <div className="flex justify-between items-center text-xs">
                          <div className="flex gap-2 items-center">
                            <Badge tone={impact.severity === "red" ? "red" : impact.severity === "green" ? "green" : "amber"}>
                              {impact.severity} severity
                            </Badge>
                            <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
                          </div>
                          <Button
                            variant="ghost"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => setSelectedImpactId(isSelected ? null : impact.id)}
                          >
                            {isSelected ? "Collapse" : "Workbench"}
                          </Button>
                        </div>

                        <h3 className="text-sm font-bold text-ink mt-3 mb-1">{impact.title}</h3>
                        <p className="text-xs text-muted leading-relaxed mb-3">{impact.reasoning}</p>

                        {impact.decision === "pending" && !isSelected && (
                          <div className="flex justify-end gap-2 border-t border-border-remorra/20 pt-3 mt-1">
                            <Button
                              variant="secondary"
                              className="h-8 px-3 text-[11px]"
                              onClick={() => decide.mutate({ impactId: impact.id, decision: "rejected" })}
                              disabled={decide.isPending}
                            >
                              Reject
                            </Button>
                            <Button
                              className="h-8 px-3 text-[11px]"
                              onClick={() => decide.mutate({ impactId: impact.id, decision: "approved" })}
                              disabled={decide.isPending}
                            >
                              Approve
                            </Button>
                          </div>
                        )}

                        <AnimatePresence>
                          {isSelected && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden mt-4 pt-4 border-t border-border-remorra/40 flex flex-col gap-3"
                            >
                              <h4 className="text-xs font-bold text-ink flex items-center gap-1.5">
                                <GitCompareArrows size={14} className="text-accent" />
                                <span>Conflict Workbench</span>
                              </h4>
                              
                              {impact.conflictReason && (
                                <div className="p-3 bg-red-soft/20 text-red border border-red/10 rounded-lg text-[10px] leading-relaxed flex gap-2">
                                  <CircleAlert size={14} className="flex-shrink-0" />
                                  <span><strong>Reason:</strong> {impact.conflictReason}</span>
                                </div>
                              )}

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <span className="text-[9px] text-muted font-bold tracking-wider uppercase block mb-1">
                                    Current Record
                                  </span>
                                  <pre className="p-2.5 text-[9px] font-mono text-muted bg-[#f5f5f5] rounded-lg max-h-[120px] overflow-auto border border-[#eee] leading-relaxed">
                                    {impact.currentSnapshot
                                      ? JSON.stringify(impact.currentSnapshot, null, 2)
                                      : "No snapshot (Create operation)"}
                                  </pre>
                                </div>
                                <div>
                                  <span className="text-[9px] text-muted font-bold tracking-wider uppercase block mb-1">
                                    Proposed Change
                                  </span>
                                  <pre className="p-2.5 text-[9px] font-mono text-[#1b3e6c] bg-[#eef6ff] rounded-lg max-h-[120px] overflow-auto border border-[#d2e4ff] leading-relaxed">
                                    {JSON.stringify(impact.resolvedPayload ?? impact.proposedChange, null, 2)}
                                  </pre>
                                </div>
                              </div>

                              <div className="flex flex-col gap-3 bg-surface-2 p-3.5 rounded-lg border border-border-remorra/60">
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                  <span className="text-xs font-bold text-ink">Resolution:</span>
                                  <div className="relative">
                                    <select
                                      className="appearance-none bg-white border border-border-remorra rounded-md px-3 py-1.5 pr-8 text-xs font-medium text-ink focus:outline-none focus:ring-2 focus:ring-accent/20 cursor-pointer"
                                      value={resolutionType}
                                      onChange={(e) => setResolutionType(e.target.value as any)}
                                    >
                                      <option value="accept">Accept Imported Change</option>
                                      <option value="keep_current">Keep Current Record</option>
                                      <option value="edit_payload">Edit Change Payload</option>
                                      <option value="retarget">Retarget Target Entity ID</option>
                                      <option value="split">Split into a New Change</option>
                                      <option value="reject">Reject Change</option>
                                    </select>
                                    <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                                  </div>
                                </div>

                                {resolutionType === "edit_payload" && (
                                  <div>
                                    <span className="text-[9px] text-muted font-bold tracking-wider uppercase block mb-1">
                                      Edit Data Payload (JSON)
                                    </span>
                                    <textarea
                                      className="w-full h-[120px] font-mono text-[9px] leading-relaxed p-2.5 bg-white border border-border-remorra rounded-md focus:outline-none focus:ring-2 focus:ring-accent/20"
                                      value={editPayloadStr}
                                      onChange={(e) => setEditPayloadStr(e.target.value)}
                                      placeholder='e.g., {"title": "new title"}'
                                    />
                                  </div>
                                )}

                                {resolutionType === "retarget" && (
                                  <div>
                                    <span className="text-[9px] text-muted font-bold tracking-wider uppercase block mb-1">
                                      New Target Entity ID (UUID)
                                    </span>
                                    <input
                                      type="text"
                                      className="w-full h-8 px-3 text-xs bg-white border border-border-remorra rounded-md focus:outline-none focus:ring-2 focus:ring-accent/20"
                                      value={retargetId}
                                      onChange={(e) => setRetargetId(e.target.value)}
                                      placeholder="Paste target record UUID"
                                    />
                                  </div>
                                )}

                                <div>
                                  <span className="text-[9px] text-muted font-bold tracking-wider uppercase block mb-1">
                                    Resolution Note (Auditing)
                                  </span>
                                  <input
                                    type="text"
                                    className="w-full h-8 px-3 text-xs bg-white border border-border-remorra rounded-md focus:outline-none focus:ring-2 focus:ring-accent/20"
                                    value={resolutionNote}
                                    onChange={(e) => setResolutionNote(e.target.value)}
                                    placeholder="Reason for this resolution decision..."
                                  />
                                </div>

                                <div className="flex gap-2 justify-end border-t border-border-remorra/30 pt-3 mt-1">
                                  <Button
                                    variant="secondary"
                                    onClick={() => setSelectedImpactId(null)}
                                    className="h-7 px-3 text-[10px]"
                                  >
                                    Cancel
                                  </Button>
                                  <Button
                                    className="h-7 px-3 text-[10px]"
                                    disabled={resolve.isPending}
                                    onClick={() => {
                                      const bodyPayload: {
                                        impactId: string;
                                        resolution: string;
                                        note?: string;
                                        payload?: any;
                                      } = {
                                        impactId: impact.id,
                                        resolution: resolutionType,
                                      };
                                      if (resolutionNote.trim()) {
                                        bodyPayload.note = resolutionNote.trim();
                                      }
                                      if (resolutionType === "edit_payload") {
                                        try {
                                          bodyPayload.payload = JSON.parse(editPayloadStr);
                                        } catch {
                                          alert("Invalid JSON payload.");
                                          return;
                                        }
                                      } else if (resolutionType === "retarget") {
                                        bodyPayload.payload = { entityId: retargetId.trim() };
                                      }
                                      resolve.mutate(bodyPayload);
                                    }}
                                  >
                                    {resolve.isPending ? "Resolving..." : "Apply Resolution"}
                                  </Button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {impacts.length > 0 && (
              <Button
                className="w-full py-2.5 mt-2"
                disabled={
                  complete.isPending ||
                  impacts.some((item: any) => item.decision === "pending") ||
                  impacts.some((item: any) => ["conflict", "blocked"].includes(item.status)) ||
                  session.status === "completed"
                }
                onClick={() => complete.mutate()}
              >
                {session.status === "completed"
                  ? "Changes committed"
                  : complete.isPending
                  ? "Committing..."
                  : impacts.some((item: any) => ["conflict", "blocked"].includes(item.status))
                  ? "Unresolved conflicts or blocks"
                  : "Commit approved changes"}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

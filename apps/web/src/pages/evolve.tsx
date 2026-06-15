import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, GitCompareArrows, MessageSquareText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card } from "../components/ui";
import { api, waitForJob, streamTextJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";

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

  return <div className="page">
    <section className="page-heading compact-heading"><div><Badge tone="amber">Founder controlled change</Badge><h1>Evolve with confidence</h1><p>Explore consequences, screen linked impacts, and approve changes before they become product history.</p></div></section>
    {!session ? <Card className="evolve-start"><GitCompareArrows size={23} /><h2>Start a change session</h2><label>Topic<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="What product decision or change are you considering?" /></label><div className="mode-picker"><button className={mode === "ideate" ? "active" : ""} onClick={() => setMode("ideate")}><MessageSquareText size={17} /><strong>Ideate</strong><span>Discuss and shape the change first.</span></button><button className={mode === "publish" ? "active" : ""} onClick={() => setMode("publish")}><ShieldCheck size={17} /><strong>Publish</strong><span>No chat. Go directly to impact screening.</span></button></div><Button disabled={topic.trim().length < 3 || create.isPending} onClick={() => create.mutate()}>Start {mode} session</Button></Card> :
      <div className="evolve-grid"><Card className="conversation-panel"><div className="panel-heading"><span><MessageSquareText size={17} />{session.mode} session</span><Badge tone="neutral">{session.status}</Badge></div><div className="conversation refine-conversation">{session.mode === "publish" ? <div className="empty-state">Publish mode intentionally has no conversation. Run impact screening now.</div> : <>{chat.map((item, index) => <div className={`chat-message chat-message--${item.role}`} key={`${item.role}-${index}`}>{item.content}</div>)}<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Discuss the intended outcome, evidence, assumptions, and tradeoffs..." />
<div className="chat-actions-container" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
  <Button disabled={message.trim().length < 2 || send.isPending || session.status === "completed"} onClick={() => send.mutate()}>
    {streamState === "connecting"
      ? "Connecting..."
      : streamState === "reconnecting"
      ? "Reconnecting..."
      : send.isPending
      ? "Thinking..."
      : "Send to Evolve"}
  </Button>
  {streamState === "reconnecting" && <span className="reconnecting-label" style={{ color: "var(--muted)", fontSize: "11px" }}>Network drop. Reconnecting...</span>}
</div></>}</div></Card><div className="impact-panel"><Card className="impact-summary"><div className="impact-summary__icon"><GitCompareArrows size={20} /></div><div><span>Impact workflow</span><h2>Screen every linked consequence</h2></div><Badge tone="green"><ShieldCheck size={13} />Atomic approval</Badge></Card><Card className="impact-card"><h3>{impacts.length ? `${impacts.length} linked impacts` : "Ready to screen"}</h3><p>Screening creates proposals only. Product records change together after every item has a founder decision.</p><Button disabled={screen.isPending || session.status === "completed"} onClick={() => screen.mutate()}><Check size={15} />{screen.isPending ? "Screening..." : impacts.length ? "Screen again" : "Run impact screening"}</Button></Card>
      {impacts.map((impact: any) => {
        const isSelected = selectedImpactId === impact.id;
        const statusInfo = getStatusLabelAndTone(impact);
        return (
          <Card className={`impact-card impact-card--${impact.severity}`} key={impact.id}>
            <div className="panel-heading" style={{ cursor: "pointer" }} onClick={() => setSelectedImpactId(isSelected ? null : impact.id)}>
              <Badge tone={impact.severity === "red" ? "red" : impact.severity === "green" ? "green" : "amber"}>{impact.severity}</Badge>
              <Badge tone={statusInfo.tone}>{statusInfo.label}</Badge>
            </div>
            <h3 style={{ cursor: "pointer", marginTop: "8px" }} onClick={() => setSelectedImpactId(isSelected ? null : impact.id)}>{impact.title}</h3>
            <p>{impact.reasoning}</p>
            {impact.decision === "pending" && !isSelected && (
              <div className="heading-actions">
                <Button variant="secondary" onClick={() => decide.mutate({ impactId: impact.id, decision: "rejected" })}>Reject</Button>
                <Button onClick={() => decide.mutate({ impactId: impact.id, decision: "approved" })}>Approve</Button>
              </div>
            )}
            
            {isSelected && (
              <div className="conflict-workbench" style={{ marginTop: "15px", paddingTop: "15px", borderTop: "1px solid #ddd" }}>
                <h4 style={{ margin: "0 0 10px 0", fontSize: "13px" }}>Conflict Workbench</h4>
                {impact.conflictReason && (
                  <div style={{ padding: "8px 12px", background: "#fff5f5", color: "#c53030", borderRadius: "6px", fontSize: "11px", marginBottom: "12px", border: "1px solid #fed7d7" }}>
                    <strong>Reason:</strong> {impact.conflictReason}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "15px" }}>
                  <div>
                    <span style={{ fontSize: "10px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Current Database Record</span>
                    <pre style={{ margin: 0, padding: "8px", fontSize: "10px", background: "#f5f5f5", borderRadius: "6px", maxHeight: "150px", overflow: "auto", border: "1px solid #eee" }}>
                      {impact.currentSnapshot ? JSON.stringify(impact.currentSnapshot, null, 2) : "No snapshot (Create operation)"}
                    </pre>
                  </div>
                  <div>
                    <span style={{ fontSize: "10px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Proposed Change Payload</span>
                    <pre style={{ margin: 0, padding: "8px", fontSize: "10px", background: "#eef6ff", borderRadius: "6px", maxHeight: "150px", overflow: "auto", border: "1px solid #d2e4ff" }}>
                      {JSON.stringify(impact.resolvedPayload ?? impact.proposedChange, null, 2)}
                    </pre>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "#fafafa", padding: "12px", borderRadius: "6px", border: "1px solid #eaeaea" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span style={{ fontSize: "11px", fontWeight: "bold" }}>Resolution:</span>
                    <select
                      value={resolutionType}
                      onChange={(e) => setResolutionType(e.target.value as any)}
                      style={{ padding: "4px 8px", fontSize: "11px", borderRadius: "4px", border: "1px solid #ccc", background: "#fff" }}
                    >
                      <option value="accept">Accept Imported Change</option>
                      <option value="keep_current">Keep Current Record</option>
                      <option value="edit_payload">Edit Proposed Change Payload</option>
                      <option value="retarget">Retarget Target Entity ID</option>
                      <option value="split">Split into a New Change</option>
                      <option value="reject">Reject Change</option>
                    </select>
                  </div>
                  {resolutionType === "edit_payload" && (
                    <div>
                      <span style={{ fontSize: "10px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Edit Data Payload (JSON)</span>
                      <textarea
                        value={editPayloadStr}
                        onChange={(e) => setEditPayloadStr(e.target.value)}
                        style={{ width: "100%", height: "120px", fontFamily: "monospace", fontSize: "10px", padding: "6px", borderRadius: "4px", border: "1px solid #ccc", background: "#fff" }}
                        placeholder='e.g., {"title": "new title"}'
                      />
                    </div>
                  )}
                  {resolutionType === "retarget" && (
                    <div>
                      <span style={{ fontSize: "10px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>New Target Entity ID (UUID)</span>
                      <input
                        type="text"
                        value={retargetId}
                        onChange={(e) => setRetargetId(e.target.value)}
                        style={{ width: "100%", padding: "6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #ccc", background: "#fff" }}
                        placeholder="Paste target record UUID"
                      />
                    </div>
                  )}
                  <div>
                    <span style={{ fontSize: "10px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Resolution Note (Auditing)</span>
                    <input
                      type="text"
                      value={resolutionNote}
                      onChange={(e) => setResolutionNote(e.target.value)}
                      style={{ width: "100%", padding: "6px", fontSize: "11px", borderRadius: "4px", border: "1px solid #ccc", background: "#fff" }}
                      placeholder="Reason for this resolution decision..."
                    />
                  </div>
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "5px" }}>
                    <Button variant="secondary" onClick={() => setSelectedImpactId(null)} style={{ fontSize: "11px", padding: "4px 10px" }}>Cancel</Button>
                    <Button
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
                      disabled={resolve.isPending}
                      style={{ fontSize: "11px", padding: "4px 10px" }}
                    >
                      {resolve.isPending ? "Resolving..." : "Apply Resolution"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        );
      })}
      {impacts.length > 0 && (
        <Button
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
            ? "Unresolved conflicts/blocks"
            : "Commit approved changes"}
        </Button>
      )}
    </div></div>}
  </div>;
}

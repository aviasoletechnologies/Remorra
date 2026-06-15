import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, GitCompareArrows, MessageSquareText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card } from "../components/ui";
import { api, waitForJob } from "../lib/api";
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
  const send = useMutation({
    mutationFn: async () => {
      const content = message.trim();
      const job = await api<{ id: string }>(`/evolve/sessions/${session.id}/messages`, { method: "POST", body: JSON.stringify({ content }) });
      setChat((items) => [...items, { role: "user", content }, { role: "assistant", content: "" }]);
      setMessage("");
      return waitForJob<{ response: string }>(job.id, 90_000, (progress) => {
        if (typeof progress.stream !== "string") return;
        setChat((items) => items.map((item, index) => index === items.length - 1 ? { ...item, content: progress.stream as string } : item));
      });
    },
    onSuccess: (result) => {
      setChat((items) => items.map((item, index) => index === items.length - 1 ? { ...item, content: result.response } : item));
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

  return <div className="page">
    <section className="page-heading compact-heading"><div><Badge tone="amber">Founder controlled change</Badge><h1>Evolve with confidence</h1><p>Explore consequences, screen linked impacts, and approve changes before they become product history.</p></div></section>
    {!session ? <Card className="evolve-start"><GitCompareArrows size={23} /><h2>Start a change session</h2><label>Topic<input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="What product decision or change are you considering?" /></label><div className="mode-picker"><button className={mode === "ideate" ? "active" : ""} onClick={() => setMode("ideate")}><MessageSquareText size={17} /><strong>Ideate</strong><span>Discuss and shape the change first.</span></button><button className={mode === "publish" ? "active" : ""} onClick={() => setMode("publish")}><ShieldCheck size={17} /><strong>Publish</strong><span>No chat. Go directly to impact screening.</span></button></div><Button disabled={topic.trim().length < 3 || create.isPending} onClick={() => create.mutate()}>Start {mode} session</Button></Card> :
      <div className="evolve-grid"><Card className="conversation-panel"><div className="panel-heading"><span><MessageSquareText size={17} />{session.mode} session</span><Badge tone="neutral">{session.status}</Badge></div><div className="conversation refine-conversation">{session.mode === "publish" ? <div className="empty-state">Publish mode intentionally has no conversation. Run impact screening now.</div> : <>{chat.map((item, index) => <div className={`chat-message chat-message--${item.role}`} key={`${item.role}-${index}`}>{item.content}</div>)}<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Discuss the intended outcome, evidence, assumptions, and tradeoffs..." /><Button disabled={message.trim().length < 2 || send.isPending || session.status === "completed"} onClick={() => send.mutate()}>{send.isPending ? "Thinking..." : "Send to Evolve"}</Button></>}</div></Card><div className="impact-panel"><Card className="impact-summary"><div className="impact-summary__icon"><GitCompareArrows size={20} /></div><div><span>Impact workflow</span><h2>Screen every linked consequence</h2></div><Badge tone="green"><ShieldCheck size={13} />Atomic approval</Badge></Card><Card className="impact-card"><h3>{impacts.length ? `${impacts.length} linked impacts` : "Ready to screen"}</h3><p>Screening creates proposals only. Product records change together after every item has a founder decision.</p><Button disabled={screen.isPending || session.status === "completed"} onClick={() => screen.mutate()}><Check size={15} />{screen.isPending ? "Screening..." : impacts.length ? "Screen again" : "Run impact screening"}</Button></Card>{impacts.map((impact: any) => <Card className={`impact-card impact-card--${impact.severity}`} key={impact.id}><div className="panel-heading"><Badge tone={impact.severity === "red" ? "amber" : impact.severity === "green" ? "green" : "neutral"}>{impact.severity}</Badge><Badge tone="neutral">{impact.decision}</Badge></div><h3>{impact.title}</h3><p>{impact.reasoning}</p>{impact.decision === "pending" && <div className="heading-actions"><Button variant="secondary" onClick={() => decide.mutate({ impactId: impact.id, decision: "rejected" })}>Reject</Button><Button onClick={() => decide.mutate({ impactId: impact.id, decision: "approved" })}>Approve</Button></div>}</Card>)}{impacts.length > 0 && <Button disabled={complete.isPending || impacts.some((item: any) => item.decision === "pending") || session.status === "completed"} onClick={() => complete.mutate()}>{session.status === "completed" ? "Changes committed" : complete.isPending ? "Committing..." : "Commit approved changes"}</Button>}</div></div>}
  </div>;
}

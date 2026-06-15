import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Link2, MessageSquareText, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Progress } from "../components/ui";
import { api, waitForJob, streamTextJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";

type ChatItem = { role: "user" | "assistant"; content: string };

export function RefinePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatItem[]>([]);
  useEffect(() => {
    setSessionId(
      projectId ? window.localStorage.getItem(`remorra:refine:${projectId}`) : null,
    );
  }, [projectId]);
  const { data: pack } = useQuery({
    queryKey: ["product-pack", projectId],
    queryFn: () => api<any>(`/projects/${projectId}/product-pack`),
    enabled: Boolean(projectId),
    retry: false,
  });
  const { data: session } = useQuery({
    queryKey: ["refine-session", sessionId],
    queryFn: () => api<any>(`/refine/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
  });
  const start = useMutation({
    mutationFn: () =>
      api<any>("/refine/sessions", {
        method: "POST",
        body: JSON.stringify({ projectId }),
      }),
    onSuccess: (data) => {
      setSessionId(data.id);
      window.localStorage.setItem(`remorra:refine:${projectId}`, data.id);
    },
  });
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
  const [streamState, setStreamState] = useState<"idle" | "connecting" | "reconnecting" | "connected" | "done" | "failed">("idle");
  const send = useMutation({
    mutationFn: async () => {
      const content = message.trim();
      const job = await api<{ id: string }>(
        `/refine/sessions/${sessionId}/messages`,
        { method: "POST", body: JSON.stringify({ content }) },
      );
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
      void queryClient.invalidateQueries({
        queryKey: ["refine-session", sessionId],
      });
    },
  });
  const extract = useMutation({
    mutationFn: () =>
      api(`/refine/sessions/${sessionId}/extract`, { method: "POST" }),
  });
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "confirm" | "reject" }) =>
      api(`/refine/proposals/${id}/${action}`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["refine-session", sessionId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["product-pack", projectId],
      });
    },
  });

  return (
    <div className="page">
      <section className="page-heading compact-heading">
        <div>
          <Badge tone="green">Refine</Badge>
          <h1>Turn intent into connected product truth</h1>
          <p>AI proposes. You confirm. Only approved entities enter the Product Pack.</p>
        </div>
        {!sessionId && (
          <Button onClick={() => start.mutate()} disabled={start.isPending}>
            <Sparkles size={16} />Start Refine session
          </Button>
        )}
      </section>
      <div className="refine-grid">
        <Card className="conversation-panel">
          <div className="panel-heading">
            <span><MessageSquareText size={17} />Guided product definition</span>
            <Badge tone="neutral">{session?.stage ?? "Not started"}</Badge>
          </div>
          <div className="conversation refine-conversation">
            {sessionId ? (
              <>
                {chat.map((item, index) => (
                  <div className={`chat-message chat-message--${item.role}`} key={`${item.role}-${index}`}>
                    {item.content}
                  </div>
                ))}
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Explain an ambition, measurable outcome, persona, pain point, or user need..." />
                <div className="heading-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Button variant="secondary" onClick={() => extract.mutate()} disabled={extract.isPending}>Extract proposals</Button>
                  <Button onClick={() => send.mutate()} disabled={message.trim().length < 2 || send.isPending}>
                    {streamState === "connecting"
                      ? "Connecting..."
                      : streamState === "reconnecting"
                      ? "Reconnecting..."
                      : send.isPending
                      ? "Thinking..."
                      : "Send"}
                  </Button>
                  {streamState === "reconnecting" && <span className="reconnecting-label" style={{ color: "var(--muted)", fontSize: "11px" }}>Network drop. Reconnecting...</span>}
                </div>
              </>
            ) : <div className="empty-state">Start a session to validate the Founder Pack and build the connected strategy.</div>}
          </div>
        </Card>
        <div className="impact-panel">
          <Card className="impact-summary">
            <div className="impact-summary__icon"><Link2 size={20} /></div>
            <div><span>Product Pack coverage</span><h2>{pack?.coveragePercent ?? 0}% connected</h2></div>
            <Badge tone={pack?.linkageValid ? "green" : "amber"}>{pack?.linkageValid ? "Pass criteria met" : "Thread incomplete"}</Badge>
          </Card>
          <Progress value={pack?.coveragePercent ?? 0} label="Product Pack coverage" />
          {(session?.proposals ?? []).map((proposal: any) => (
            <Card className="impact-card" key={proposal.id}>
              <div className="impact-card__heading"><Badge tone={proposal.status === "pending" ? "amber" : proposal.status === "confirmed" ? "green" : "red"}>{proposal.entityType.replace("_", " ")}</Badge><span>{proposal.status}</span></div>
              <pre className="proposal-json">{JSON.stringify(proposal.payload, null, 2)}</pre>
              {proposal.status === "pending" && <div className="decision-actions"><Button variant="secondary" onClick={() => decide.mutate({ id: proposal.id, action: "reject" })}><X size={15} />Reject</Button><Button onClick={() => decide.mutate({ id: proposal.id, action: "confirm" })}><Check size={15} />Confirm</Button></div>}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

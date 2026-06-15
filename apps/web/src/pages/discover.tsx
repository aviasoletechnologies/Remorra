import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileUp, MessageSquareText, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card } from "../components/ui";
import { api, waitForJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";

export function DiscoverPage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const { data: session } = useQuery({
    queryKey: ["discover-session", projectId],
    queryFn: () => api<any>(`/discover/sessions/project/${projectId}/latest`),
    enabled: Boolean(projectId),
    retry: false,
  });
  const start = useMutation({
    mutationFn: () =>
      api<any>("/discover/sessions", {
        method: "POST",
        body: JSON.stringify({ projectId }),
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["discover-session", projectId],
      }),
  });
  const send = useMutation({
    mutationFn: async () => {
      const content = message.trim();
      const job = await api<{ id: string }>(
        `/discover/sessions/${session.id}/messages`,
        { method: "POST", body: JSON.stringify({ content }) },
      );
      setMessage("");
      await waitForJob(job.id);
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["discover-session", projectId],
      }),
  });
  const extract = useMutation({
    mutationFn: async () => {
      const job = await api<{ id: string }>(
        `/discover/sessions/${session.id}/extract`,
        { method: "POST" },
      );
      await waitForJob(job.id);
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["discover-session", projectId],
      }),
  });
  const confirm = useMutation({
    mutationFn: (extractId: string) =>
      api(`/discover/sessions/${session.id}/extracts/${extractId}/confirm`, {
        method: "POST",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["discover-session", projectId],
      });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return api(`/discover/sessions/${session.id}/upload`, {
        method: "POST",
        body: form,
      });
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({
        queryKey: ["discover-session", projectId],
      }),
  });
  useEffect(() => {
    if (extract.isSuccess) extract.reset();
  }, [session?.extracts?.length]);

  return (
    <div className="page">
      <section className="page-heading compact-heading">
        <div>
          <Badge tone="green">Discover</Badge>
          <h1>Turn the founder’s raw thinking into evidence</h1>
          <p>Chat first, extract explicitly, then approve the Founder Pack.</p>
        </div>
        {!session && <Button onClick={() => start.mutate()}><Sparkles size={16} />Start Discover</Button>}
      </section>
      {!session ? <Card className="empty-state">Start a conversation to capture the problem, audience, product concept, vision, and commercial context.</Card> :
        <div className="refine-grid">
          <Card className="conversation-panel">
            <div className="panel-heading"><span><MessageSquareText size={17} />Brain Dump Facilitator</span><Badge tone="neutral">{session.status}</Badge></div>
            <div className="conversation refine-conversation">
              {(session.messages ?? []).map((item: any) => <div className={`chat-message chat-message--${item.role}`} key={item.id}>{item.content}</div>)}
              <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tell Remorra what you are trying to build and why..." />
              <div className="heading-actions">
                <label className="button button--secondary upload-button"><FileUp size={15} />Upload PDF/DOCX<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ""; }} /></label>
                <Button variant="secondary" disabled={extract.isPending || !(session.messages?.length)} onClick={() => extract.mutate()}>{extract.isPending ? "Extracting..." : "Extract Founder Pack"}</Button>
                <Button disabled={send.isPending || message.trim().length < 2} onClick={() => send.mutate()}>{send.isPending ? "Thinking..." : "Send"}</Button>
              </div>
            </div>
          </Card>
          <div className="impact-panel">
            {(session.extracts ?? []).map((item: any) => <Card className="impact-card" key={item.id}><div className="impact-card__heading"><Badge tone={item.confirmedAt ? "green" : "amber"}>Founder Pack draft</Badge><span>{item.confirmedAt ? "confirmed" : "review required"}</span></div><pre className="proposal-json">{JSON.stringify(item.payload, null, 2)}</pre>{!item.confirmedAt && <Button onClick={() => confirm.mutate(item.id)}><Check size={15} />Confirm Founder Pack</Button>}</Card>)}
            {!session.extracts?.length && <Card className="empty-state">Your reviewed structured extract will appear here.</Card>}
          </div>
        </div>}
    </div>
  );
}

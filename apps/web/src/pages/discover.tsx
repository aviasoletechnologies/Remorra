import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileUp, MessageSquareText, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Card, Textarea } from "../components/ui";
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
    <div className="page-container py-8 px-6 max-w-[1440px] mx-auto flex flex-col gap-6">
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <Badge tone="green">Discover</Badge>
          <h1 className="text-3xl font-bold tracking-tight text-ink mt-3 mb-1">Turn the founder’s raw thinking into evidence</h1>
          <p className="text-sm text-muted">Chat first, extract explicitly, then approve the Founder Pack.</p>
        </div>
        {!session && <Button onClick={() => start.mutate()} className="h-10 px-5 gap-2"><Sparkles size={16} />Start Discover</Button>}
      </section>
      {!session ? <Card className="p-16 flex flex-col items-center justify-center text-center border-dashed border-border-remorra/60 text-muted text-sm font-medium">Start a conversation to capture the problem, audience, product concept, vision, and commercial context.</Card> :
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <Card className="flex flex-col border-border-remorra/70 shadow-sm overflow-hidden bg-surface">
            <div className="h-[50px] px-5 border-b border-border-remorra/60 flex items-center justify-between bg-surface-2">
              <span className="flex items-center gap-2 text-xs font-bold text-ink uppercase tracking-wider"><MessageSquareText size={16} className="text-accent" />Brain Dump Facilitator</span><Badge tone="neutral">{session.status}</Badge>
            </div>
            <div className="p-5 flex flex-col gap-4 min-h-[420px] bg-canvas/30">
              {(session.messages ?? []).map((item: any) => (
                <div className={`p-3.5 rounded-2xl text-[13px] leading-relaxed max-w-[85%] ${item.role === 'user' ? 'bg-[#eef4ef] text-[#1a3324] border border-[#d5e2d7] self-end rounded-br-sm' : 'bg-white text-ink border border-border-remorra/60 self-start rounded-bl-sm shadow-sm'}`} key={item.id}>
                  {item.content}
                </div>
              ))}
              <div className="mt-auto flex flex-col gap-3 pt-4 border-t border-border-remorra/40">
                <Textarea className="min-h-[80px] bg-white border-border-remorra focus:ring-accent/20" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Tell Remorra what you are trying to build and why..." />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <label className="inline-flex items-center justify-center h-9 px-4 text-xs font-semibold rounded-lg bg-surface-2 border border-border-remorra text-ink hover:bg-border-remorra/40 transition-colors cursor-pointer mr-auto"><FileUp size={14} className="mr-1.5 text-muted" />Upload PDF/DOCX<input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload.mutate(file); event.target.value = ""; }} /></label>
                  <Button variant="secondary" className="h-9 text-xs px-4" disabled={extract.isPending || !(session.messages?.length)} onClick={() => extract.mutate()}>{extract.isPending ? "Extracting..." : "Extract Founder Pack"}</Button>
                  <Button className="h-9 text-xs px-5" disabled={send.isPending || message.trim().length < 2} onClick={() => send.mutate()}>{send.isPending ? "Thinking..." : "Send"}</Button>
                </div>
              </div>
            </div>
          </Card>
          <div className="flex flex-col gap-4">
            {(session.extracts ?? []).map((item: any) => (
              <Card className="p-6 flex flex-col gap-4 border-border-remorra/70 shadow-sm bg-surface" key={item.id}>
                <div className="flex items-center justify-between">
                  <Badge tone={item.confirmedAt ? "green" : "amber"}>Founder Pack draft</Badge>
                  <span className="text-[10px] uppercase font-bold text-muted">{item.confirmedAt ? "confirmed" : "review required"}</span>
                </div>
                <pre className="text-[10px] bg-surface-2 p-3 rounded-lg border border-border-remorra/40 text-muted overflow-auto max-h-[400px]">{JSON.stringify(item.payload, null, 2)}</pre>
                {!item.confirmedAt && <Button className="w-full mt-2" onClick={() => confirm.mutate(item.id)}><Check size={15} className="mr-1.5" />Confirm Founder Pack</Button>}
              </Card>
            ))}
            {!session.extracts?.length && <Card className="p-10 flex flex-col items-center justify-center text-center border-dashed border-border-remorra/60 text-muted text-xs font-medium bg-transparent shadow-none">Your reviewed structured extract will appear here.</Card>}
          </div>
        </div>}
    </div>
  );
}

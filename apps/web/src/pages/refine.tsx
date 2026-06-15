import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Link2, MessageSquareText, Sparkles, X, LoaderCircle } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { Badge, Button, Card, Progress, Textarea } from "../components/ui";
import { api, streamTextJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { motion, AnimatePresence } from "framer-motion";

type ChatItem = { role: "user" | "assistant"; content: string };

export function RefinePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState<ChatItem[]>([]);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSessionId(
      projectId ? window.localStorage.getItem(`remorra:refine:${projectId}`) : null,
    );
  }, [projectId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat.length]);

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
    <div className="page-container py-8 px-6 max-w-[1440px] mx-auto flex flex-col gap-6">
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Badge tone="green">Refine</Badge>
          <h1 className="text-3xl font-bold font-sans tracking-tight text-ink mt-3 mb-1">Turn intent into connected product truth</h1>
          <p className="text-xs text-muted">AI proposes. You confirm. Only approved entities enter the Product Pack.</p>
        </div>
        {!sessionId && (
          <Button onClick={() => start.mutate()} disabled={start.isPending} className="flex-shrink-0">
            <Sparkles size={16} />
            <span>Start Refine session</span>
          </Button>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Chat Console */}
        <Card className="col-span-12 lg:col-span-6 p-0 overflow-hidden flex flex-col shadow-lg border-border-remorra/70">
          <div className="h-[53px] px-[17px] border-b border-border-remorra flex items-center justify-between bg-surface-2">
            <span className="flex items-center gap-2 text-xs font-bold text-ink uppercase tracking-wider">
              <MessageSquareText size={17} className="text-accent" />
              <span>Guided product definition</span>
            </span>
            <Badge tone="neutral">{session?.stage ?? "Not started"}</Badge>
          </div>
          
          <div className="h-[380px] overflow-y-auto p-5 flex flex-col gap-4 bg-[#fbfcf8]">
            {sessionId ? (
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
                <div ref={chatEndRef} />
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 text-center my-auto p-6 max-w-[320px] mx-auto text-muted">
                <Sparkles size={24} className="text-accent animate-pulse" />
                <p className="text-xs leading-relaxed">
                  Start a session to validate the Founder Pack and build the connected strategy.
                </p>
              </div>
            )}
          </div>

          {sessionId && (
            <div className="p-4 border-t border-border-remorra bg-surface-2">
              <Textarea
                className="w-full min-h-[80px] max-h-[140px] resize-y border border-border-remorra rounded-lg p-3 bg-white outline-none text-xs leading-relaxed focus:ring-2 focus:ring-accent/20 transition-all mb-3"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Explain an ambition, measurable outcome, persona, pain point, or user need..."
                disabled={send.isPending || extract.isPending}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() => extract.mutate()}
                  disabled={extract.isPending || send.isPending}
                  className="flex items-center gap-1.5"
                >
                  {extract.isPending ? <LoaderCircle size={14} className="animate-spin" /> : null}
                  <span>Extract proposals</span>
                </Button>
                <Button
                  onClick={() => send.mutate()}
                  disabled={message.trim().length < 2 || send.isPending || extract.isPending}
                >
                  {streamState === "connecting"
                    ? "Connecting..."
                    : streamState === "reconnecting"
                    ? "Reconnecting..."
                    : send.isPending
                    ? "Thinking..."
                    : "Send message"}
                </Button>
                {streamState === "reconnecting" && (
                  <span className="text-[10px] text-muted font-medium">Network drop. Reconnecting...</span>
                )}
              </div>
            </div>
          )}
        </Card>

        {/* Right: Coverage and Proposals */}
        <div className="col-span-12 lg:col-span-6 flex flex-col gap-4">
          <Card className="p-5 flex items-center justify-between shadow-sm border-border-remorra/80">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-accent-soft text-accent flex items-center justify-center shadow-sm">
                <Link2 size={20} />
              </div>
              <div>
                <span className="text-[9px] font-bold text-muted uppercase tracking-wider block">Product Pack coverage</span>
                <h2 className="text-base font-bold text-ink mt-0.5">{pack?.coveragePercent ?? 0}% connected</h2>
              </div>
            </div>
            <Badge tone={pack?.linkageValid ? "green" : "amber"}>
              {pack?.linkageValid ? "Pass criteria met" : "Thread incomplete"}
            </Badge>
          </Card>
          
          <div className="px-1.5">
            <Progress value={pack?.coveragePercent ?? 0} label="Product Pack coverage" />
          </div>

          <div className="flex flex-col gap-3 mt-2">
            <AnimatePresence>
              {(session?.proposals ?? []).map((proposal: any, idx: number) => {
                const statusTone = proposal.status === "pending" ? "amber" : proposal.status === "confirmed" ? "green" : "red";
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: idx * 0.05 }}
                    key={proposal.id}
                  >
                    <Card className="p-4 shadow-sm border-border-remorra/70 flex flex-col gap-3 bg-surface">
                      <div className="flex justify-between items-center text-xs">
                        <Badge tone={statusTone}>{proposal.entityType.replace("_", " ")}</Badge>
                        <span className="text-[10px] font-semibold text-muted tracking-wide uppercase">{proposal.status}</span>
                      </div>
                      
                      <div className="rounded-lg bg-[#f4f6f2] border border-[#e2e6df] p-3 overflow-x-auto text-[10px] font-mono text-[#384a3e] max-h-[200px]">
                        <pre className="whitespace-pre-wrap leading-relaxed">{JSON.stringify(proposal.payload, null, 2)}</pre>
                      </div>

                      {proposal.status === "pending" && (
                        <div className="flex justify-end gap-2 border-t border-border-remorra/40 pt-3 mt-1">
                          <Button
                            variant="secondary"
                            className="h-8 px-3 text-[11px] flex items-center gap-1"
                            onClick={() => decide.mutate({ id: proposal.id, action: "reject" })}
                            disabled={decide.isPending}
                          >
                            <X size={14} />
                            <span>Reject</span>
                          </Button>
                          <Button
                            className="h-8 px-3 text-[11px] flex items-center gap-1"
                            onClick={() => decide.mutate({ id: proposal.id, action: "confirm" })}
                            disabled={decide.isPending}
                          >
                            <Check size={14} />
                            <span>Confirm</span>
                          </Button>
                        </div>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

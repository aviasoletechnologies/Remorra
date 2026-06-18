import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Sparkles, Plus, ChevronDown, Mic, AudioLines, ArrowUp, Copy, ThumbsUp, ThumbsDown, Upload, RotateCcw, MoreHorizontal, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, Textarea } from "../components/ui";
import { ErrorState, Page, ChatWorkspaceSkeleton } from "../components/app-ui";
import { api, streamTextJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { motion } from "framer-motion";

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
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [streamedReply, setStreamedReply] = useState("");
  const [streamState, setStreamState] = useState<"idle" | "connecting" | "reconnecting" | "connected">("idle");
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isTextareaScrollable, setIsTextareaScrollable] = useState(false);

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
      setAttachedFile(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      setIsTextareaScrollable(false);
      setStreamedReply("");
      useWorkspaceStore.getState().setStreamState("connecting");

      try {
        const formData = new FormData();
        formData.append("content", content);
        if (attachedFile) {
          formData.append("file", attachedFile);
        }
        const result = await api<{ id: string | null }>(`/workspace/projects/${projectId}/messages`, {
          method: "POST",
          body: formData,
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
                  useWorkspaceStore.getState().setStreamState(state);
                }
                if (state === "done") {
                  stop();
                  setStreamState("idle");
                  useWorkspaceStore.getState().setStreamState("idle");
                  resolve();
                }
                if (state === "failed") {
                  stop();
                  setStreamState("idle");
                  useWorkspaceStore.getState().setStreamState("idle");
                  reject(new Error("The routed response failed."));
                }
              },
              (streamError) => {
                stop();
                setStreamState("idle");
                useWorkspaceStore.getState().setStreamState("idle");
                reject(streamError);
              },
              (event) => {
                if (["log", "info", "completed", "failed"].includes(event.type)) {
                  useWorkspaceStore.getState().addLog({
                    sequence: event.sequence,
                    type: event.type,
                    delta: event.delta ?? null,
                    snapshot: event.snapshot ?? null,
                    metadata: event.metadata,
                    createdAt: new Date().toISOString(),
                  });
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



  if (isLoading) {
    return <ChatWorkspaceSkeleton />;
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
    <Page className="h-[calc(100vh-64px)] !p-4 md:!p-6 flex flex-col overflow-hidden">
      <div className="w-full flex-1 flex flex-col min-h-0">
        <Card className="relative flex-1 flex flex-col overflow-hidden p-0 min-h-0 border-none shadow-none bg-transparent">
          <div className="flex-grow overflow-y-auto bg-transparent p-4 sm:p-6 min-h-0" aria-live="polite">
            <div className="max-w-4xl mx-auto w-full flex flex-col gap-3 px-4 pb-40">
              {visibleMessages.length === 0 ? (
                <div className="my-auto flex max-w-[520px] mx-auto gap-4 rounded-2xl border border-primary/15 bg-accent-soft/15 p-5 text-sm shadow-sm">
                  <Sparkles size={24} className="text-primary flex-shrink-0" />
                  <div className="flex flex-col gap-1 text-left">
                    <strong className="font-bold text-foreground">Start with what you want to build.</strong>
                    <p className="text-muted-foreground leading-relaxed">
                      The router will read your first message, compare it against the active skill descriptions, and either activate the best match or continue the conversation normally.
                    </p>
                  </div>
                </div>
              ) : (
                visibleMessages.map((item) => {
                  const isAssistant = item.role === "assistant";
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18 }}
                      key={item.id}
                      className={`flex flex-col w-full ${isAssistant ? "items-start" : "items-end"}`}
                    >
                      {!isAssistant ? (
                        <div className="bg-[#d9fdd3] text-zinc-900 px-4 py-2.5 rounded-[16px] rounded-tr-[4px] shadow-xs text-sm font-normal leading-relaxed break-words max-w-[85%]">
                          {item.content}
                        </div>
                      ) : (
                        <div className="bg-white text-zinc-900 px-4 py-2.5 rounded-[16px] rounded-tl-[4px] shadow-xs text-sm font-normal leading-relaxed break-words max-w-[85%]">
                          {item.content}
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}

              {streamedReply ? (
                <div className="flex flex-col items-start w-full">
                  <div className="bg-white text-zinc-900 px-4 py-2.5 rounded-[16px] rounded-tl-[4px] shadow-xs text-sm font-normal leading-relaxed break-words max-w-[85%]">
                    {streamedReply}
                  </div>
                </div>
              ) : null}

              <div ref={endRef} />
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-background/95 via-background/70 to-transparent px-4 pb-6 pt-4 w-full flex flex-col items-center">
            <div className="max-w-4xl w-full">
              {send.error ? (
                <p className="form-message mb-3 text-xs text-destructive text-center">
                  {send.error.message}
                </p>
              ) : null}
              {streamState === "reconnecting" && (
                <p className="mb-2 text-xs text-muted-foreground text-center animate-pulse">
                  Connection interrupted. Resuming stream...
                </p>
              )}

              {attachedFile ? (
                <div className="flex items-center gap-1.5 mb-2 px-1">
                  <span className="text-xs text-zinc-500 bg-zinc-100 rounded-full px-2.5 py-0.5 flex items-center gap-1 max-w-[240px] truncate">
                    <Paperclip size={10} className="shrink-0" />
                    <span className="truncate">{attachedFile.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachedFile(null)}
                    className="text-zinc-400 hover:text-zinc-600"
                    title="Remove file"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : null}

              <div className={`rounded-[24px] border border-zinc-200 bg-white/90 shadow-xs flex px-4 py-2 gap-3 focus-within:bg-white focus-within:ring-2 focus-within:ring-zinc-100 focus-within:border-zinc-300 transition-all ${
                isTextareaScrollable ? "items-end" : "items-center"
              }`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.docx"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setAttachedFile(file);
                    event.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileInputRef.current?.click()}
                  className="text-zinc-400 hover:text-zinc-600 shrink-0 transition-colors"
                  title="Attach document (PDF, TXT, DOCX)"
                >
                  <Paperclip size={15} />
                </button>
                <textarea
                  ref={textareaRef}
                  style={{ outline: 'none', boxShadow: 'none', overflowY: isTextareaScrollable ? 'auto' : 'hidden', resize: 'none' }}
                  className={`flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-none focus-visible:ring-0 focus-visible:outline-none text-sm text-zinc-800 placeholder-zinc-400 py-1 max-h-24 leading-relaxed ${
                    isTextareaScrollable ? "" : "no-scrollbar"
                  }`}
                  value={message}
                  onChange={(event) => {
                    setMessage(event.target.value);
                    event.target.style.height = "auto";
                    const scrollHeight = event.target.scrollHeight;
                    event.target.style.height = `${scrollHeight}px`;
                    setIsTextareaScrollable(scrollHeight > 96);
                  }}
                  placeholder="Ask anything"
                  rows={1}
                  disabled={busy}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (message.trim().length >= 2 && !busy) {
                        send.mutate();
                      }
                    }
                  }}
                />

              <button
                type="button"
                disabled={busy || message.trim().length < 2}
                onClick={() => send.mutate()}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs shrink-0 ${
                  message.trim().length >= 2 && !busy
                    ? "bg-zinc-900 hover:bg-zinc-800 text-white"
                    : "bg-zinc-900 text-white opacity-95 hover:opacity-100"
                }`}
                title={busy ? "Thinking..." : "Send message"}
              >
                {busy ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                ) : message.trim().length >= 2 ? (
                  <ArrowUp size={15} />
                ) : (
                  <AudioLines size={15} />
                )}
              </button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </Page>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareText, Sparkles, Plus, ChevronDown, Mic, AudioLines, ArrowUp, Copy, ThumbsUp, ThumbsDown, Upload, RotateCcw, MoreHorizontal, Paperclip, X, PanelRightOpen, PanelRightClose } from "lucide-react";
import React, { useEffect, useRef, useState, useLayoutEffect } from "react";
import { Badge, Button, Card, Textarea } from "../components/ui";
import { ErrorState, Page, ChatWorkspaceSkeleton } from "../components/app-ui";
import { ProductPackPanel } from "../components/product-pack-panel";
import { RefineSummaryPanel } from "../components/refine-summary-panel";
import type { ProductPackDto, Project } from "@remorra/contracts";
import { api, streamTextJob, advancePhase } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

const mdComponents = {
  h1: (p: any) => <h1 className="text-base font-semibold mt-3 mb-1" {...p} />,
  h2: (p: any) => <h2 className="text-sm font-semibold mt-3 mb-1" {...p} />,
  h3: (p: any) => <h3 className="text-sm font-semibold mt-2 mb-0.5" {...p} />,
  p: (p: any) => <p className="mb-2 last:mb-0" {...p} />,
  ul: (p: any) => <ul className="list-disc pl-4 mb-2 space-y-0.5" {...p} />,
  ol: (p: any) => <ol className="list-decimal pl-4 mb-2 space-y-0.5" {...p} />,
  li: (p: any) => <li className="leading-relaxed" {...p} />,
  strong: (p: any) => <strong className="font-semibold" {...p} />,
  hr: () => <hr className="my-3 border-zinc-200" />,
  code: (p: any) => <code className="bg-zinc-100 rounded px-1 py-0.5 text-xs font-mono" {...p} />,
  a: ({ href, children, ...p }: any) => {
    const isDocDownload = href?.includes("/documents/") && href?.includes("/download");
    if (isDocDownload) {
      const handleDownload = async (e: React.MouseEvent) => {
        e.preventDefault();
        const toastId = toast.loading("Checking PDF status...");
        try {
          const docId = href.split("/documents/")[1].split("/")[0];
          const response = await api<{ ready: boolean; url?: string }>(`/documents/${docId}/download`);
          if (response.ready && response.url) {
            toast.success("PDF is ready! Opening in new tab...", { id: toastId });
            window.open(response.url, "_blank");
          } else {
            toast.info("PDF is still generating. Please wait a few seconds and try again!", { id: toastId });
          }
        } catch (err) {
          toast.error("Failed to fetch PDF. Please try again.", { id: toastId });
          console.error(err);
        }
      };
      return (
        <a
          href={href}
          onClick={handleDownload}
          className="text-emerald-600 hover:underline font-medium inline-flex items-center gap-1 cursor-pointer"
          {...p}
        >
          {children}
        </a>
      );
    }
    return <a href={href} className="text-emerald-600 hover:underline" {...p}>{children}</a>;
  },
};

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
  phaseComplete: boolean;
};

type PendingMessage = { id: string; role: "user"; content: string };

function cleanMessageContent(content: string): string {
  return content
    .replace(/<skill_done\/>/g, "")
    .replace(/<generate_pdf\/>/g, "")
    .replace(/<output_data>[\s\S]*<\/output_data>/gi, "")
    .replace(/```json[\s\S]*/gi, "")
    .trim();
}

export function AiWorkspacePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/projects"),
    enabled: Boolean(projectId),
  });
  const project = projects?.find((p) => p.id === projectId);

  const nextPhaseMap: Record<string, string> = {
    discover: "refine",
    refine: "initiate",
    initiate: "venture",
    venture: "evolve",
  };

  const advance = useMutation({
    mutationFn: () => {
      if (!project) throw new Error("No active project");
      const nextPhase = nextPhaseMap[project.phase];
      if (!nextPhase) throw new Error("Already at the final phase");
      return advancePhase(project.id, nextPhase, project.version);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project advanced to the next phase!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to advance phase.");
    },
  });

  const [message, setMessage] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [streamedReply, setStreamedReply] = useState("");
  const [streamState, setStreamState] = useState<"idle" | "connecting" | "reconnecting" | "connected">("idle");
  const [liveProductPack, setLiveProductPack] = useState<ProductPackDto | null>(null);
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [showProductPack, setShowProductPack] = useState(true);
  const [showRefineSummary, setShowRefineSummary] = useState(true);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isTextareaScrollable, setIsTextareaScrollable] = useState(false);
  const [textboxHeight, setTextboxHeight] = useState(80);
  const inputWrapperRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const completedMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!inputWrapperRef.current) return;
    const observer = new ResizeObserver(() => {
      if (inputWrapperRef.current) {
        setTextboxHeight(inputWrapperRef.current.offsetHeight);
      }
    });
    observer.observe(inputWrapperRef.current);
    return () => observer.disconnect();
  }, []);

  const { data: conversation, isLoading, error } = useQuery({
    queryKey: ["workspace-flow", projectId],
    queryFn: () => api<WorkspaceConversation>(`/workspace/projects/${projectId}/flow`),
    enabled: Boolean(projectId),
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
  });



  useLayoutEffect(() => {
    if (!conversation?.messages) return;

    // Clear active stream text once the database has committed the matching response
    if (streamedReply) {
      const lastMsg = conversation.messages[conversation.messages.length - 1];
      const cleanStreamed = streamedReply.replace(/<skill_done\/>/g, "").trim();
      const cleanDb = lastMsg?.content?.trim() ?? "";

      if (
        lastMsg?.role === "assistant" &&
        (cleanDb === cleanStreamed || cleanStreamed.startsWith(cleanDb))
      ) {
        setStreamedReply("");
      }
    }
  }, [conversation?.messages, streamedReply]);

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
          // Follow the job chain — auto-started skills get a new jobId per transition
          const followJobChain = async (currentJobId: string): Promise<void> => {
            let nextJobId: string | null = null;
            await new Promise<void>((resolve, reject) => {
              let stop = () => {};
              stop = streamTextJob(
                currentJobId,
                setStreamedReply,
                (state) => {
                  if (state === "connecting" || state === "reconnecting" || state === "connected") {
                    setStreamState(state);
                    useWorkspaceStore.getState().setStreamState(state);
                  }
                  if (state === "done") {
                    stop();
                    if (!nextJobId) {
                      setStreamState("idle");
                      useWorkspaceStore.getState().setStreamState("idle");
                    }
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
                  if (event.type === "skill_transition" && event.metadata?.nextJobId) {
                    nextJobId = event.metadata.nextJobId as string;
                  }
                  if (event.type === "completed" && event.metadata?.messages) {
                    const sseMessages = event.metadata.messages as any[];
                    const assistantMsg = sseMessages.find((m) => m.role === "assistant");
                    if (assistantMsg) {
                      completedMessageIdRef.current = assistantMsg.id;
                    }
                    queryClient.setQueryData(["workspace-flow", projectId], (oldData: any) => {
                      if (!oldData) return oldData;
                      const existingIds = new Set(oldData.messages.map((m: any) => m.id));
                      const newMessages = sseMessages.filter((m) => !existingIds.has(m.id));
                      return {
                        ...oldData,
                        messages: [...oldData.messages, ...newMessages],
                      };
                    });
                    setStreamedReply("");
                  }
                  if (event.type === "product_pack_update" && event.metadata?.productPack) {
                    setLiveProductPack(event.metadata.productPack as ProductPackDto);
                  }
                  if (["log", "info", "completed", "failed", "skill_transition"].includes(event.type)) {
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
            if (nextJobId) {
              setStreamedReply("");
              await followJobChain(nextJobId);
            }
          };
          await followJobChain(jobId);
        }

        return { ...result, pendingId };
      } catch (error) {
        setPendingMessages((current) => current.filter((item) => item.id !== pendingId));
        throw error;
      }
    },
    onSuccess: async (data: any) => {
      if (data?.pendingId) {
        setPendingMessages((current) => current.filter((m) => m.id !== data.pendingId));
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["workspace-flow", projectId] }),
        queryClient.invalidateQueries({ queryKey: ["projects"] }),
      ]);
    },
  });

  const busy = send.isPending;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Scroll immediately
    container.scrollTop = container.scrollHeight;

    // Scroll after layout/paint to handle any delayed rendering
    const handle = requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    return () => cancelAnimationFrame(handle);
  }, [conversation?.messages.length, pendingMessages.length, streamedReply, textboxHeight, busy]);

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
  const visibleMessages = [...conversation.messages, ...pendingMessages];
  const placeholder = activeSkill
    ? `Ask about ${activeSkill.name.toLowerCase()}...`
    : "Describe your product idea or ask a normal question...";

  return (
    <Page className="h-[calc(100vh-64px)] !p-0 flex overflow-hidden">
      {/* Chat column */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 md:p-6">
        <Card className="relative flex-1 flex flex-col overflow-hidden p-0 min-h-0 border-none shadow-none bg-transparent">
          {/* Floating toggle button positioned to the left of the scrollbar */}
          {projectId && project?.phase === "refine" && (
            <button
              type="button"
              onClick={() => setShowRefineSummary(prev => !prev)}
              className="absolute top-4 right-8 z-20 hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 bg-white/90 hover:bg-white text-zinc-500 hover:text-zinc-800 shadow-sm backdrop-blur transition-all cursor-pointer text-xs font-semibold"
              title={showRefineSummary ? "Hide entity summary" : "Show entity summary"}
            >
              {showRefineSummary ? (
                <>
                  <span>Hide Summary</span>
                  <PanelRightClose size={13} />
                </>
              ) : (
                <>
                  <span>Show Summary</span>
                  <PanelRightOpen size={13} />
                </>
              )}
            </button>
          )}
          {projectId && project?.phase !== "refine" && (
            <button
              type="button"
              onClick={() => setShowProductPack(prev => !prev)}
              className="absolute top-4 right-8 z-20 hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 bg-white/90 hover:bg-white text-zinc-500 hover:text-zinc-800 shadow-sm backdrop-blur transition-all cursor-pointer text-xs font-semibold"
              title={showProductPack ? "Hide Product Pack" : "Show Product Pack"}
            >
              {showProductPack ? (
                <>
                  <span>Hide Pack</span>
                  <PanelRightClose size={13} />
                </>
              ) : (
                <>
                  <span>Show Pack</span>
                  <PanelRightOpen size={13} />
                </>
              )}
            </button>
          )}

          {project && nextPhaseMap[project.phase] && conversation && conversation.phaseComplete && (
            <button
              type="button"
              disabled={advance.isPending}
              onClick={() => advance.mutate()}
              className="absolute top-4 left-4 z-20 flex items-center gap-1.5 px-4.5 py-1.5 rounded-full border border-primary/25 bg-primary/10 hover:bg-primary/20 text-primary shadow-sm backdrop-blur transition-all cursor-pointer text-xs font-semibold disabled:opacity-50"
            >
              {advance.isPending
                ? "Advancing..."
                : `Continue to ${
                    project.phase === "discover"
                      ? "Refine"
                      : project.phase === "refine"
                      ? "Initiate"
                      : project.phase === "initiate"
                      ? "Venture"
                      : "Evolve"
                  } →`}
            </button>
          )}

          <div ref={scrollContainerRef} className="flex-grow overflow-y-auto bg-transparent p-4 sm:p-6 min-h-0" aria-live="polite">
            <div
              className="max-w-4xl mx-auto w-full flex flex-col gap-3 px-4"
              style={{ paddingBottom: `${textboxHeight - 20}px` }}
            >
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
                  const shouldSkipAnimation = item.id === completedMessageIdRef.current;
                  return (
                    <motion.div
                      layout
                      initial={shouldSkipAnimation ? false : { opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.24, ease: "easeOut" }}
                      key={item.id}
                      className={`flex flex-col w-full ${isAssistant ? "items-start" : "items-end"}`}
                    >
                      {!isAssistant ? (
                        <div className="bg-[#d9fdd3] text-zinc-900 px-4 py-2.5 rounded-[16px] rounded-tr-[4px] shadow-xs text-sm font-normal leading-relaxed break-words max-w-[85%]">
                          {cleanMessageContent(item.content)}
                        </div>
                      ) : (
                        <div className="bg-white text-zinc-900 px-4 py-2.5 rounded-[16px] rounded-tl-[4px] shadow-xs text-sm font-normal leading-relaxed break-words max-w-[85%]">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{cleanMessageContent(item.content)}</ReactMarkdown>
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}

              {busy && !streamedReply ? (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  className="flex flex-col items-start w-full"
                >
                  <div className="bg-white text-zinc-900 px-4 py-3 rounded-[16px] rounded-tl-[4px] shadow-xs text-sm font-normal flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "-300ms", animationDuration: "1s" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "-150ms", animationDuration: "1s" }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: "0ms", animationDuration: "1s" }} />
                  </div>
                </motion.div>
              ) : null}

              {streamedReply ? (
                <motion.div
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24, ease: "easeOut" }}
                  className="flex flex-col items-start w-full"
                >
                  <div className="bg-white text-zinc-900 px-4 py-2.5 rounded-[16px] rounded-tl-[4px] shadow-xs text-sm font-normal leading-relaxed break-words max-w-[85%]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{cleanMessageContent(streamedReply)}</ReactMarkdown>
                  </div>
                </motion.div>
              ) : null}

              <div ref={endRef} />
            </div>
          </div>

          <div
            ref={inputWrapperRef}
            className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-background/95 via-background/70 to-transparent px-4 pb-6 pt-4 w-full flex flex-col items-center"
          >
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
      {/* Refine phase: Live Entity Summary (HARDIK doc Q12). Other phases: Product Pack. */}
      <AnimatePresence>
        {projectId && project?.phase === "refine" && showRefineSummary && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="hidden lg:flex shrink-0 border-l border-border bg-background flex-col overflow-hidden"
          >
            <RefineSummaryPanel projectId={projectId} onCollapse={() => setShowRefineSummary(false)} />
          </motion.div>
        )}
        {projectId && project?.phase !== "refine" && showProductPack && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 320, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="hidden lg:flex shrink-0 border-l border-border bg-background flex-col overflow-hidden"
          >
            <ProductPackPanel
              projectId={projectId}
              externalPack={liveProductPack}
              onCollapse={() => setShowProductPack(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </Page>
  );
}

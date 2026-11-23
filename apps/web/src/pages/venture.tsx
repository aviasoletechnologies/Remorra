import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronRight, Download, Layers, ListChecks, Loader2, Lock, Pencil, ShieldAlert, Sparkles, Trash2, Upload, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api, waitForJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card, Input } from "../components/ui";
import { buttonVariants } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { AppTabs, Page, PageHeader, SectionCard, TableSkeleton } from "../components/app-ui";
import { Skeleton } from "../components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";

const columns = ["ready", "in_progress", "review", "done"] as const;
const buildPhaseStatuses = ["draft", "ready", "active", "closed"] as const;
const tabs = ["board", "goals", "raid", "build"] as const;
const tabItems = [
  { value: "board", label: "Backlog", icon: ListChecks },
  { value: "goals", label: "Goals", icon: Sparkles },
  { value: "raid", label: "RAID", icon: ShieldAlert },
  { value: "build", label: "Build Phases", icon: Layers },
] satisfies Array<{ value: (typeof tabs)[number]; label: string; icon: any }>;

export function VenturePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("board");
  const [raidTitle, setRaidTitle] = useState("");
  const [raidType, setRaidType] = useState("Risk");
  const [raidSeverity, setRaidSeverity] = useState("medium");
  const [newBuildPhaseName, setNewBuildPhaseName] = useState("");
  const [newBuildPhaseDescription, setNewBuildPhaseDescription] = useState("");
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const [editingStoryTitle, setEditingStoryTitle] = useState("");
  const [editingBuildPhaseId, setEditingBuildPhaseId] = useState<string | null>(null);
  const [editingBuildPhaseName, setEditingBuildPhaseName] = useState("");
  const [editingBuildPhaseDescription, setEditingBuildPhaseDescription] = useState("");
  const [expandedBuildPhaseId, setExpandedBuildPhaseId] = useState<string | null>(null);
  const [generatingPack, setGeneratingPack] = useState(false);
  const [exportingSync, setExportingSync] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["venture", projectId],
    queryFn: () => api<any>(`/projects/${projectId}/venture`),
    enabled: Boolean(projectId),
  });

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["venture", projectId] });

  const command = useMutation({
    mutationFn: ({ path, method = "POST", body, version }: any) => {
      const options: RequestInit = { method };
      if (version) options.headers = { "If-Match": String(version) };
      if (body !== undefined) options.body = JSON.stringify(body);
      return api(`/projects/${projectId}${path}`, options);
    },
    onSuccess: refresh,
    onError: (err: any) => toast.error(err?.message || "That action failed."),
  });

  const { data: buildPhases = [], isLoading: loadingBuildPhases } = useQuery({
    queryKey: ["build-phases", projectId],
    queryFn: () => api<any[]>(`/projects/${projectId}/build-phases`),
    enabled: Boolean(projectId) && tab === "build",
  });

  const refreshBuildPhases = () => void queryClient.invalidateQueries({ queryKey: ["build-phases", projectId] });

  const { data: expandedPhase } = useQuery({
    queryKey: ["build-phase", projectId, expandedBuildPhaseId],
    queryFn: () => api<any>(`/projects/${projectId}/build-phases/${expandedBuildPhaseId}`),
    enabled: Boolean(projectId && expandedBuildPhaseId),
  });

  const { data: buildPack, refetch: refetchPack } = useQuery({
    queryKey: ["build-pack", projectId, expandedBuildPhaseId],
    queryFn: () => api<any>(`/projects/${projectId}/build-phases/${expandedBuildPhaseId}/pack`),
    enabled: Boolean(projectId && expandedBuildPhaseId),
    refetchInterval: (query) => (query.state.data && (query.state.data as any).status === "generating" ? 3000 : false),
  });

  const { data: syncUploads = [], refetch: refetchSyncUploads } = useQuery({
    queryKey: ["build-sync-uploads", projectId, expandedBuildPhaseId],
    queryFn: () => api<any[]>(`/projects/${projectId}/build-phases/${expandedBuildPhaseId}/sync/uploads`),
    enabled: Boolean(projectId && expandedBuildPhaseId),
    refetchInterval: (query) => ((query.state.data as any[])?.some((u) => u.status === "queued" || u.status === "running") ? 3000 : false),
  });

  const buildPhaseCommand = useMutation({
    mutationFn: ({ path, method = "POST", body, version }: any) => {
      const options: RequestInit = { method };
      if (version) options.headers = { "If-Match": String(version) };
      if (body !== undefined) options.body = JSON.stringify(body);
      return api(`/projects/${projectId}/build-phases${path}`, options);
    },
    onSuccess: () => {
      refreshBuildPhases();
      void queryClient.invalidateQueries({ queryKey: ["build-phase", projectId, expandedBuildPhaseId] });
    },
    onError: (err: any) => toast.error(err?.message || "That action failed."),
  });

  const uploadBuildPhaseFile = async (buildPhaseId: string, field: "brand-kit" | "user-flow", file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api(`/projects/${projectId}/build-phases/${buildPhaseId}/${field}`, { method: "PATCH", body: formData });
      refreshBuildPhases();
      void queryClient.invalidateQueries({ queryKey: ["build-phase", projectId, buildPhaseId] });
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload file.");
    }
  };

  const uploadSyncFile = async (buildPhaseId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      await api(`/projects/${projectId}/build-phases/${buildPhaseId}/sync/upload`, { method: "POST", body: formData });
      toast.success("Build Sync File uploaded — statuses will update once it's processed.");
      refreshBuildPhases();
      void refetchSyncUploads();
    } catch (err: any) {
      toast.error(err?.message || "Failed to upload Build Sync File.");
    }
  };

  const generatePack = async (buildPhaseId: string) => {
    setGeneratingPack(true);
    try {
      const job = await api<{ id: string }>(`/projects/${projectId}/build-phases/${buildPhaseId}/pack/generate`, { method: "POST" });
      await waitForJob(job.id);
      await refetchPack();
      toast.success("Build Pack generated. Download the Build Sync Instructions below for the handoff steps.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate Build Pack.");
    } finally {
      setGeneratingPack(false);
    }
  };

  const exportSync = async (buildPhaseId: string) => {
    setExportingSync(true);
    try {
      const job = await api<{ id: string }>(`/projects/${projectId}/build-phases/${buildPhaseId}/sync/export`);
      const result = await waitForJob<{ downloadUrl?: string }>(job.id);
      if (result.downloadUrl) window.open(result.downloadUrl, "_blank", "noopener");
    } catch (err: any) {
      toast.error(err?.message || "Failed to export Build Sync File.");
    } finally {
      setExportingSync(false);
    }
  };

  const stories = data?.stories ?? [];
  const goals = data?.goals ?? [];
  const founderOrTeam = Boolean(data?.role);

  const submit = (path: string, body: any, clear: () => void) => {
    command.mutate({ path, body }, { onSuccess: clear });
  };

  return (
    <Page className="relative min-h-[500px]">
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow="Venture"
          tone="blue"
          title="Delivery workspace"
          description="Backlog and risk register for this project."
          actions={
            <Link to="/evolve" className={cn(buttonVariants({ variant: "outline" }))}>
              Go to Evolve
              <ArrowRight size={14} />
            </Link>
          }
        />

        <AppTabs value={tab} items={tabItems} onChange={setTab} />

        {isLoading ? (
          tab === "board" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 animate-pulse">
              {columns.map((colStatus) => (
                <div className="flex min-h-[460px] flex-col gap-3 rounded-2xl border border-border bg-secondary/35 p-3" key={colStatus}>
                  <div className="flex justify-between items-center pb-2 border-b border-border">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-6 rounded-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6">
              <TableSkeleton rows={5} columns={4} />
            </div>
          )
        ) : (
          <>
            {tab === "board" && (
              <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {columns.map((status) => {
                  const columnStories = stories.filter((story: any) => story.status === status);
                  return (
                    <div className="flex min-h-[460px] flex-col gap-3 rounded-2xl border border-border bg-secondary/55 p-3 shadow-inner" key={status}>
                      <div className="flex justify-between items-center pb-2 border-b border-border">
                        <strong className="text-[11px] font-bold text-foreground uppercase tracking-wider">
                          {status.replace("_", " ")}
                        </strong>
                        <Badge tone="neutral">{columnStories.length}</Badge>
                      </div>

                      <div className="flex flex-col gap-2.5">
                        <AnimatePresence>
                          {columnStories.map((story: any) => (
                            <motion.div
                              initial={{ opacity: 0, y: 4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.18 }}
                              key={story.id}
                            >
                              <Card className="p-3.5 flex flex-col gap-3 bg-card hover:border-primary/25 hover:shadow-md transition-[border-color,box-shadow] duration-200">
                                <div className="flex justify-between items-center gap-2">
                                  <Badge tone="neutral">{story.priority}</Badge>
                                  {story.buildPhase?.name && (
                                    <Badge tone="blue" className="truncate max-w-[100px]">{story.buildPhase.name}</Badge>
                                  )}
                                </div>

                                {editingStoryId === story.id ? (
                                  <div className="flex min-h-[40px] items-center gap-1.5">
                                    <Input
                                      autoFocus
                                      className="h-8 flex-1 text-xs"
                                      value={editingStoryTitle}
                                      onChange={(event) => setEditingStoryTitle(event.target.value)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter" && editingStoryTitle.trim().length >= 2) {
                                          command.mutate({
                                            path: `/stories/${story.id}`,
                                            method: "PATCH",
                                            version: story.version,
                                            body: { title: editingStoryTitle.trim() },
                                          });
                                          setEditingStoryId(null);
                                        }
                                        if (event.key === "Escape") setEditingStoryId(null);
                                      }}
                                    />
                                    <button
                                      className="w-6 h-6 shrink-0 rounded-md text-primary hover:bg-accent-soft/40 flex items-center justify-center cursor-pointer"
                                      aria-label="Save story title"
                                      disabled={editingStoryTitle.trim().length < 2}
                                      onClick={() => {
                                        command.mutate({
                                          path: `/stories/${story.id}`,
                                          method: "PATCH",
                                          version: story.version,
                                          body: { title: editingStoryTitle.trim() },
                                        });
                                        setEditingStoryId(null);
                                      }}
                                    >
                                      <Check size={13} />
                                    </button>
                                    <button
                                      className="w-6 h-6 shrink-0 rounded-md text-muted-foreground hover:bg-secondary flex items-center justify-center cursor-pointer"
                                      aria-label="Cancel editing"
                                      onClick={() => setEditingStoryId(null)}
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="group flex min-h-[40px] items-center justify-between gap-1.5">
                                    <h3 className="text-xs font-bold text-foreground leading-relaxed font-sans">
                                      {story.title}
                                    </h3>
                                    {founderOrTeam && (
                                      <button
                                        className="w-6 h-6 shrink-0 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent-soft/40 hover:text-primary flex items-center justify-center transition-all cursor-pointer"
                                        aria-label="Edit story title"
                                        onClick={() => {
                                          setEditingStoryId(story.id);
                                          setEditingStoryTitle(story.title);
                                        }}
                                      >
                                        <Pencil size={12} />
                                      </button>
                                    )}
                                  </div>
                                )}

                                <footer className="flex justify-between items-center border-t border-border pt-2.5 mt-1 text-[9px] text-muted-foreground">
                                  <span className="truncate max-w-[120px] font-semibold">
                                    {story.epic?.title ?? "Unassigned epic"}
                                  </span>
                                  {status !== "done" && founderOrTeam && (
                                    story.buildPhase?.status === "active" || story.buildPhase?.status === "closed" ? (
                                      <span
                                        className="w-6 h-6 rounded-md text-muted-foreground flex items-center justify-center"
                                        title={
                                          story.buildPhase.status === "closed"
                                            ? `Build Phase "${story.buildPhase.name}" is closed — no longer editable.`
                                            : `Build Phase "${story.buildPhase.name}" is Active — status updates only via Build Sync upload.`
                                        }
                                      >
                                        <Lock size={12} />
                                      </span>
                                    ) : (
                                      <button
                                        className="w-6 h-6 rounded-md hover:bg-accent-soft/40 text-primary flex items-center justify-center transition-colors cursor-pointer"
                                        aria-label="Move story forward"
                                        onClick={() =>
                                          command.mutate({
                                            path: `/stories/${story.id}`,
                                            method: "PATCH",
                                            version: story.version,
                                            body: { status: columns[columns.indexOf(status) + 1] },
                                          })
                                        }
                                      >
                                        <ChevronRight size={14} />
                                      </button>
                                    )
                                  )}
                                </footer>
                              </Card>
                            </motion.div>
                          ))}
                        </AnimatePresence>

                        {columnStories.length === 0 && (
                          <div className="rounded-xl border border-dashed border-border py-12 text-center text-[10px] text-muted-foreground">
                            No stories
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </section>
            )}

            {tab === "goals" && (
              <section className="flex flex-col gap-4">
                {goals.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border py-12 text-center text-[11px] text-muted-foreground">
                    No Goals yet — build them out in Refine or ask Evolve to create one.
                  </div>
                )}
                {goals.map((goal: any) => (
                  <Card key={goal.id} className="p-4 flex flex-col gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{goal.title}</h3>
                      {goal.detail && <p className="mt-1 text-xs text-muted-foreground">{goal.detail}</p>}
                    </div>
                    {goal.epics.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground">No Epics under this Goal yet.</p>
                    ) : (
                      <div className="flex flex-col gap-2.5 pl-3 border-l-2 border-border">
                        {goal.epics.map((epic: any) => (
                          <div key={epic.id} className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                              <ChevronRight size={12} className="text-muted-foreground" />
                              {epic.title}
                            </div>
                            {epic.stories.length === 0 ? (
                              <p className="pl-4 text-[11px] text-muted-foreground">No Stories under this Epic yet.</p>
                            ) : (
                              <ul className="flex flex-col gap-1 pl-4">
                                {epic.stories.map((story: any) => (
                                  <li key={story.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                    <Badge tone="neutral">{story.status}</Badge>
                                    {story.title}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </section>
            )}

            {tab === "raid" && (
              <WorkspaceList
                title="RAID register"
                placeholder="Risk, assumption, issue, or dependency"
                value={raidTitle}
                onValue={setRaidTitle}
                onAdd={() =>
                  submit("/raid", { type: raidType, title: raidTitle, severity: raidSeverity }, () => setRaidTitle(""))
                }
                extraControls={
                  <>
                    <Select value={raidType} onValueChange={(v) => { if (v) setRaidType(v); }}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Risk">Risk</SelectItem>
                        <SelectItem value="Assumption">Assumption</SelectItem>
                        <SelectItem value="Issue">Issue</SelectItem>
                        <SelectItem value="Dependency">Dependency</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={raidSeverity} onValueChange={(v) => { if (v) setRaidSeverity(v); }}>
                      <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                }
                items={(data?.raid ?? []).map((item: any) => ({
                  ...item,
                  subtitle: `${item.type} · ${item.severity}`,
                  action: founderOrTeam ? (
                    <div className="flex items-center gap-2">
                      <Select
                        value={item.status}
                        onValueChange={(status) =>
                          command.mutate({ path: `/raid/${item.id}`, method: "PATCH", version: item.version, body: { status } })
                        }
                      >
                        <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="mitigated">Mitigated</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                      <button
                        className="w-6 h-6 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors cursor-pointer"
                        aria-label="Delete RAID item"
                        onClick={() =>
                          command.mutate({ path: `/raid/${item.id}`, method: "DELETE", version: item.version })
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ) : (
                    <Badge tone="neutral">{item.status}</Badge>
                  ),
                }))}
              />
            )}

            {tab === "build" && (
              <div className="flex flex-col gap-6">
                <SectionCard title="New Build Phase" description="A container for a subset of Stories going to developers">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      className="flex-1"
                      value={newBuildPhaseName}
                      onChange={(event) => setNewBuildPhaseName(event.target.value)}
                      placeholder="e.g. Core Product Build"
                    />
                    <Input
                      className="flex-1"
                      value={newBuildPhaseDescription}
                      onChange={(event) => setNewBuildPhaseDescription(event.target.value)}
                      placeholder="What does this Build Phase cover? (optional)"
                    />
                    <Button
                      className="flex-shrink-0"
                      disabled={newBuildPhaseName.trim().length < 2 || buildPhaseCommand.isPending}
                      onClick={() =>
                        buildPhaseCommand.mutate(
                          {
                            path: "",
                            body: {
                              name: newBuildPhaseName,
                              ...(newBuildPhaseDescription.trim() ? { description: newBuildPhaseDescription.trim() } : {}),
                            },
                          },
                          {
                            onSuccess: () => {
                              setNewBuildPhaseName("");
                              setNewBuildPhaseDescription("");
                            },
                          },
                        )
                      }
                    >
                      Create
                    </Button>
                  </div>
                </SectionCard>

                {loadingBuildPhases ? (
                  <TableSkeleton rows={3} columns={3} />
                ) : (
                  <div className="flex flex-col gap-3">
                    {buildPhases.length === 0 && (
                      <div className="rounded-xl border border-dashed border-border py-12 text-center text-xs text-muted-foreground">
                        No Build Phases yet.
                      </div>
                    )}
                    {buildPhases.map((phase: any) => {
                      const expanded = expandedBuildPhaseId === phase.id;
                      const editingName = editingBuildPhaseId === phase.id;
                      return (
                        <Card key={phase.id} className="p-0 overflow-hidden">
                          <div className="w-full flex items-center justify-between gap-3 p-4 hover:bg-secondary/35">
                            {editingName ? (
                              <div className="flex flex-1 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <Input
                                  autoFocus
                                  className="h-8 flex-1 text-xs"
                                  value={editingBuildPhaseName}
                                  onChange={(event) => setEditingBuildPhaseName(event.target.value)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Escape") setEditingBuildPhaseId(null);
                                  }}
                                />
                                <button
                                  className="w-6 h-6 shrink-0 rounded-md text-primary hover:bg-accent-soft/40 flex items-center justify-center cursor-pointer"
                                  aria-label="Save Build Phase name"
                                  disabled={editingBuildPhaseName.trim().length < 2}
                                  onClick={() => {
                                    buildPhaseCommand.mutate({
                                      path: `/${phase.id}`,
                                      method: "PATCH",
                                      version: phase.version,
                                      body: { name: editingBuildPhaseName.trim() },
                                    });
                                    setEditingBuildPhaseId(null);
                                  }}
                                >
                                  <Check size={13} />
                                </button>
                                <button
                                  className="w-6 h-6 shrink-0 rounded-md text-muted-foreground hover:bg-secondary flex items-center justify-center cursor-pointer"
                                  aria-label="Cancel editing"
                                  onClick={() => setEditingBuildPhaseId(null)}
                                >
                                  <X size={13} />
                                </button>
                              </div>
                            ) : (
                              <button
                                className="flex flex-1 items-center gap-3 text-left cursor-pointer group"
                                onClick={() => setExpandedBuildPhaseId(expanded ? null : phase.id)}
                              >
                                <strong className="text-xs font-bold">{phase.name}</strong>
                                <Badge tone="neutral">{phase.status}</Badge>
                                <span className="text-[10px] text-muted-foreground">{phase._count?.stories ?? 0} stories</span>
                                <span
                                  role="button"
                                  aria-label="Edit Build Phase name"
                                  className="w-6 h-6 shrink-0 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent-soft/40 hover:text-primary flex items-center justify-center transition-all cursor-pointer"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setEditingBuildPhaseId(phase.id);
                                    setEditingBuildPhaseName(phase.name);
                                    setEditingBuildPhaseDescription(phase.description ?? "");
                                  }}
                                >
                                  <Pencil size={11} />
                                </span>
                              </button>
                            )}
                            <button
                              className="cursor-pointer"
                              aria-label="Toggle Build Phase details"
                              onClick={() => setExpandedBuildPhaseId(expanded ? null : phase.id)}
                            >
                              <ChevronRight size={14} className={expanded ? "rotate-90 transition-transform" : "transition-transform"} />
                            </button>
                          </div>

                          {expanded && (
                            <div className="border-t border-border p-4 flex flex-col gap-5">
                              <div>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Description</span>
                                  {editingBuildPhaseId !== `${phase.id}-desc` && (
                                    <button
                                      className="text-[10px] text-primary hover:underline cursor-pointer flex items-center gap-1"
                                      onClick={() => {
                                        setEditingBuildPhaseId(`${phase.id}-desc`);
                                        setEditingBuildPhaseDescription(phase.description ?? "");
                                      }}
                                    >
                                      <Pencil size={10} /> Edit
                                    </button>
                                  )}
                                </div>
                                {editingBuildPhaseId === `${phase.id}-desc` ? (
                                  <div className="mt-1.5 flex flex-col gap-2">
                                    <textarea
                                      autoFocus
                                      className="w-full rounded-lg border border-input bg-card p-2 text-xs min-h-[70px]"
                                      value={editingBuildPhaseDescription}
                                      onChange={(event) => setEditingBuildPhaseDescription(event.target.value)}
                                      placeholder="What does this Build Phase cover?"
                                    />
                                    <div className="flex gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => {
                                          buildPhaseCommand.mutate({
                                            path: `/${phase.id}`,
                                            method: "PATCH",
                                            version: phase.version,
                                            body: { description: editingBuildPhaseDescription.trim() },
                                          });
                                          setEditingBuildPhaseId(null);
                                        }}
                                      >
                                        Save
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => setEditingBuildPhaseId(null)}>
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {phase.description || "No description yet."}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</span>
                                {buildPhaseStatuses.map((status) => (
                                  <Button
                                    key={status}
                                    variant={phase.status === status ? "default" : "outline"}
                                    className="h-7 text-[11px] px-2.5"
                                    disabled={buildPhaseCommand.isPending}
                                    onClick={() =>
                                      buildPhaseCommand.mutate({
                                        path: `/${phase.id}`,
                                        method: "PATCH",
                                        version: phase.version,
                                        body: { status },
                                      })
                                    }
                                  >
                                    {status}
                                  </Button>
                                ))}
                              </div>

                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Assign Stories</span>
                                <div className="mt-2 flex flex-col gap-1.5 max-h-48 overflow-y-auto rounded-lg border border-border p-2">
                                  {stories.length === 0 ? (
                                    <p className="p-2 text-center text-[11px] text-muted-foreground">
                                      No Stories in the backlog yet — build them out in Refine or ask Evolve to create one.
                                    </p>
                                  ) : null}
                                  {stories.map((story: any) => {
                                    const assignedHere = expandedPhase?.stories?.some((s: any) => s.id === story.id);
                                    const assignedElsewhere = story.buildPhaseId && story.buildPhaseId !== phase.id;
                                    return (
                                      <label key={story.id} className="flex items-center gap-2 text-xs px-1 py-1 rounded hover:bg-secondary/35">
                                        <input
                                          type="checkbox"
                                          checked={Boolean(assignedHere)}
                                          disabled={assignedElsewhere}
                                          onChange={() =>
                                            assignedHere
                                              ? buildPhaseCommand.mutate({ path: `/${phase.id}/stories/${story.id}`, method: "DELETE" })
                                              : buildPhaseCommand.mutate({ path: `/${phase.id}/stories`, body: { storyIds: [story.id] } })
                                          }
                                        />
                                        <span className={assignedElsewhere ? "text-muted-foreground line-through" : ""}>
                                          {story.title}
                                          {story.epic?.title ? (
                                            <span className="ml-1.5 text-[10px] text-muted-foreground">· {story.epic.title}</span>
                                          ) : null}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Brand Kit</span>
                                  <input
                                    type="file"
                                    className="text-xs"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      if (file) void uploadBuildPhaseFile(phase.id, "brand-kit", file);
                                    }}
                                  />
                                  {expandedPhase?.brandKitUrl && (
                                    <a href={expandedPhase.brandKitUrl} target="_blank" rel="noopener" className="text-[11px] text-primary underline">View current file</a>
                                  )}
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">User Flow</span>
                                  <input
                                    type="file"
                                    className="text-xs"
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      if (file) void uploadBuildPhaseFile(phase.id, "user-flow", file);
                                    }}
                                  />
                                  {expandedPhase?.userFlowUrl && (
                                    <a href={expandedPhase.userFlowUrl} target="_blank" rel="noopener" className="text-[11px] text-primary underline">View current file</a>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-col gap-2 border-t border-border pt-4">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Build Pack</span>
                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                      Generates a PRD, Brand Kit, User Flow, blank Build Sync File, and handoff instructions — everything your developer needs to start.
                                    </p>
                                  </div>
                                  <Button
                                    className="h-8 shrink-0 text-[11px] flex items-center gap-1.5"
                                    disabled={generatingPack || (phase.status !== "ready" && phase.status !== "active")}
                                    onClick={() => void generatePack(phase.id)}
                                  >
                                    {generatingPack ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                    Generate Pack
                                  </Button>
                                </div>
                                {buildPack && (
                                  <div className="flex flex-col gap-1 text-[11px]">
                                    <span className="text-muted-foreground">Status: {buildPack.status}</span>
                                    {buildPack.prdUrl && <a href={buildPack.prdUrl} target="_blank" rel="noopener" className="text-primary underline flex items-center gap-1"><Download size={11} /> PRD</a>}
                                    {buildPack.buildSyncFileUrl && <a href={buildPack.buildSyncFileUrl} target="_blank" rel="noopener" className="text-primary underline flex items-center gap-1"><Download size={11} /> Build Sync File (blank — send this to your developer)</a>}
                                    {buildPack.buildSyncInstructionsUrl && <a href={buildPack.buildSyncInstructionsUrl} target="_blank" rel="noopener" className="text-primary underline flex items-center gap-1"><Download size={11} /> Build Sync Instructions (read this first)</a>}
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col gap-2 border-t border-border pt-4">
                                <div>
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Build Sync</span>
                                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                                    Once your developer fills in the status column on the Build Sync File and sends it back, upload it here — story
                                    statuses in the backlog above will update automatically. Use "Pull fresh sync file" anytime to get a re-exported
                                    copy reflecting the current backlog (e.g. if you've added Stories since the pack was generated).
                                  </p>
                                </div>
                                <div className="flex items-center gap-3 flex-wrap">
                                  <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                                    <Upload size={12} />
                                    <span>Upload developer status file</span>
                                    <input
                                      type="file"
                                      className="hidden"
                                      onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        if (file) void uploadSyncFile(phase.id, file);
                                        event.target.value = "";
                                      }}
                                    />
                                  </label>
                                  <Button
                                    variant="outline"
                                    className="h-8 text-[11px] flex items-center gap-1.5"
                                    disabled={exportingSync}
                                    onClick={() => void exportSync(phase.id)}
                                  >
                                    {exportingSync ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                                    Pull fresh sync file
                                  </Button>
                                </div>
                                {syncUploads.length > 0 && (
                                  <div className="mt-1 flex flex-col gap-1.5">
                                    {syncUploads.map((upload: any) => (
                                      <div key={upload.id} className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                                        <div className="flex items-center justify-between">
                                          <span>{new Date(upload.createdAt).toLocaleString()}</span>
                                          <Badge
                                            tone={upload.status === "completed" ? "green" : upload.status === "failed" ? "red" : "amber"}
                                          >
                                            {upload.status}
                                          </Badge>
                                        </div>
                                        {upload.status === "failed" && upload.error && (
                                          <p className="text-destructive">{upload.error}</p>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Page>
  );
}

function WorkspaceList({ title, placeholder, value, onValue, onAdd, items, disabled = false, extraControls }: any) {
  return (
    <SectionCard title={title} action={<Badge tone="neutral">{items.length}</Badge>}>
      <div className="flex flex-wrap gap-2">
        <Input
          className="flex-1"
          value={value}
          onChange={(event) => onValue(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        {extraControls}
        <Button
          className="flex items-center gap-1"
          disabled={disabled || value.trim().length < 2}
          onClick={onAdd}
        >
          <span>Add</span>
        </Button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-border divide-y divide-border">
        {items.length ? (
          items.map((item: any) => (
            <motion.div
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16 }}
              className="p-4 flex justify-between items-center text-xs gap-4 hover:bg-secondary/35"
              key={item.id}
            >
              <div>
                <strong className="block text-xs font-semibold text-foreground leading-tight">
                  {item.title ?? item.name}
                </strong>
                <small className="block text-[10px] text-muted-foreground font-medium mt-0.5">{item.subtitle}</small>
              </div>
              {item.action}
            </motion.div>
          ))
        ) : (
          <div className="p-10 text-center text-sm text-muted-foreground leading-relaxed">
            Nothing here yet.
          </div>
        )}
      </div>
    </SectionCard>
  );
}

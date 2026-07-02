import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Download, Layers, ListChecks, Loader2, ShieldAlert, Sparkles, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { api, waitForJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card, Input } from "../components/ui";
import { AppTabs, Page, PageHeader, SectionCard, TableSkeleton } from "../components/app-ui";
import { Skeleton } from "../components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";

const columns = ["ready", "in_progress", "review", "done"] as const;
const buildPhaseStatuses = ["draft", "ready", "active", "closed"] as const;
const tabs = ["board", "raid", "build"] as const;
const tabItems = [
  { value: "board", label: "Backlog", icon: ListChecks },
  { value: "raid", label: "RAID", icon: ShieldAlert },
  { value: "build", label: "Build Phases", icon: Layers },
] satisfies Array<{ value: (typeof tabs)[number]; label: string; icon: any }>;

export function VenturePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("board");
  const [raidTitle, setRaidTitle] = useState("");
  const [newBuildPhaseName, setNewBuildPhaseName] = useState("");
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
  });

  const uploadBuildPhaseFile = async (buildPhaseId: string, field: "brand-kit" | "user-flow", file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    await api(`/projects/${projectId}/build-phases/${buildPhaseId}/${field}`, { method: "PATCH", body: formData });
    refreshBuildPhases();
    void queryClient.invalidateQueries({ queryKey: ["build-phase", projectId, buildPhaseId] });
  };

  const uploadSyncFile = async (buildPhaseId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    await api(`/projects/${projectId}/build-phases/${buildPhaseId}/sync/upload`, { method: "POST", body: formData });
    refreshBuildPhases();
    void refetchSyncUploads();
  };

  const generatePack = async (buildPhaseId: string) => {
    setGeneratingPack(true);
    try {
      const job = await api<{ id: string }>(`/projects/${projectId}/build-phases/${buildPhaseId}/pack/generate`, { method: "POST" });
      await waitForJob(job.id);
      await refetchPack();
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
    } finally {
      setExportingSync(false);
    }
  };

  const stories = data?.stories ?? [];
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

                                <h3 className="text-xs font-bold text-foreground leading-relaxed font-sans min-h-[40px] flex items-center">
                                  {story.title}
                                </h3>

                                <footer className="flex justify-between items-center border-t border-border pt-2.5 mt-1 text-[9px] text-muted-foreground">
                                  <span className="truncate max-w-[120px] font-semibold">
                                    {story.epic?.title ?? "Unassigned epic"}
                                  </span>
                                  {status !== "done" && founderOrTeam && (
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

            {tab === "raid" && (
              <WorkspaceList
                title="RAID register"
                placeholder="Risk, assumption, issue, or dependency"
                value={raidTitle}
                onValue={setRaidTitle}
                onAdd={() => submit("/raid", { type: "risk", title: raidTitle, severity: "amber" }, () => setRaidTitle(""))}
                items={(data?.raid ?? []).map((item: any) => ({
                  ...item,
                  subtitle: `${item.type} · ${item.status} · ${item.severity}`,
                  action: founderOrTeam ? (
                    <button
                      className="w-6 h-6 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors cursor-pointer"
                      aria-label="Delete RAID item"
                      onClick={() =>
                        command.mutate({ path: `/raid/${item.id}`, method: "DELETE", version: item.version })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null,
                }))}
              />
            )}

            {tab === "build" && (
              <div className="flex flex-col gap-6">
                <SectionCard title="New Build Phase" description="A container for a subset of Stories going to developers">
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      value={newBuildPhaseName}
                      onChange={(event) => setNewBuildPhaseName(event.target.value)}
                      placeholder="e.g. Core Product Build"
                    />
                    <Button
                      className="flex-shrink-0"
                      disabled={newBuildPhaseName.trim().length < 2 || buildPhaseCommand.isPending}
                      onClick={() =>
                        buildPhaseCommand.mutate(
                          { path: "", body: { name: newBuildPhaseName } },
                          { onSuccess: () => setNewBuildPhaseName("") },
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
                      return (
                        <Card key={phase.id} className="p-0 overflow-hidden">
                          <button
                            className="w-full flex items-center justify-between gap-3 p-4 text-left cursor-pointer hover:bg-secondary/35"
                            onClick={() => setExpandedBuildPhaseId(expanded ? null : phase.id)}
                          >
                            <div className="flex items-center gap-3">
                              <strong className="text-xs font-bold">{phase.name}</strong>
                              <Badge tone="neutral">{phase.status}</Badge>
                              <span className="text-[10px] text-muted-foreground">{phase._count?.stories ?? 0} stories</span>
                            </div>
                            <ChevronRight size={14} className={expanded ? "rotate-90 transition-transform" : "transition-transform"} />
                          </button>

                          {expanded && (
                            <div className="border-t border-border p-4 flex flex-col gap-5">
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
                                        <span className={assignedElsewhere ? "text-muted-foreground line-through" : ""}>{story.title}</span>
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
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Build Pack</span>
                                  <Button
                                    className="h-8 text-[11px] flex items-center gap-1.5"
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
                                    {buildPack.buildSyncFileUrl && <a href={buildPack.buildSyncFileUrl} target="_blank" rel="noopener" className="text-primary underline flex items-center gap-1"><Download size={11} /> Build Sync File</a>}
                                    {buildPack.buildSyncInstructionsUrl && <a href={buildPack.buildSyncInstructionsUrl} target="_blank" rel="noopener" className="text-primary underline flex items-center gap-1"><Download size={11} /> Build Sync Instructions</a>}
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-col gap-2 border-t border-border pt-4">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Build Sync</span>
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
                                      <div key={upload.id} className="flex items-center justify-between text-[10px] text-muted-foreground">
                                        <span>{new Date(upload.createdAt).toLocaleString()}</span>
                                        <Badge
                                          tone={upload.status === "completed" ? "green" : upload.status === "failed" ? "red" : "amber"}
                                        >
                                          {upload.status}
                                        </Badge>
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

function WorkspaceList({ title, placeholder, value, onValue, onAdd, items, disabled = false }: any) {
  return (
    <SectionCard title={title} action={<Badge tone="neutral">{items.length}</Badge>}>
      <div className="flex gap-2">
        <Input
          className="flex-1"
          value={value}
          onChange={(event) => onValue(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Plus, Sparkles, Trash2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { api, waitForJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card, Input } from "../components/ui";
import { motion, AnimatePresence } from "framer-motion";

const columns = ["ready", "in_progress", "review", "done"] as const;
const tabs = ["board", "cycles", "raid", "finance", "meetings", "retrospectives"] as const;

export function VenturePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("board");
  const [title, setTitle] = useState("");
  const [storyTitle, setStoryTitle] = useState("");
  const [cycleName, setCycleName] = useState("");
  const [raidTitle, setRaidTitle] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [financeDescription, setFinanceDescription] = useState("");
  const [meetingText, setMeetingText] = useState("");
  const [retroText, setRetroText] = useState("");

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

  const generate = useMutation({
    mutationFn: async ({ path }: { path: string }) => {
      const job = await api<{ id: string }>(`/projects/${projectId}${path}`, { method: "POST" });
      return waitForJob(job.id);
    },
    onSuccess: refresh,
  });

  if (isLoading) {
    return (
      <div className="page-container flex items-center justify-center min-h-[50vh]">
        <div className="flex flex-col items-center gap-3 text-sm text-muted font-medium animate-pulse">
          <LoaderCircle className="animate-spin text-accent" size={24} />
          <span>Loading delivery...</span>
        </div>
      </div>
    );
  }

  const tasks = data?.tasks ?? [];
  const stories = data?.stories ?? [];
  const defaultStory = stories[0]?.id;
  const activeCycle = data?.cycles?.find((cycle: any) => cycle.status === "active");
  const founderOrTeam = data?.role !== "supplier";
  const today = new Date().toISOString().slice(0, 10);

  const submit = (path: string, body: any, clear: () => void) => {
    command.mutate({ path, body }, { onSuccess: clear });
  };

  return (
    <div className="page-container py-8 px-6 max-w-[1440px] mx-auto flex flex-col gap-6">
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Badge tone="blue">Venture</Badge>
          <h1 className="text-3xl font-bold font-sans tracking-tight text-ink mt-3 mb-1 font-sans">
            {data?.role === "supplier" ? "My assigned tasks" : "Delivery workspace"}
          </h1>
          <p className="text-xs text-muted">
            Cycles, delivery evidence, risk, finance, meetings, and learning in one connected view.
          </p>
        </div>
        {founderOrTeam && (
          <Button
            disabled={generate.isPending}
            onClick={() => generate.mutate({ path: "/build-pack" })}
            className="flex items-center gap-1.5 flex-shrink-0"
          >
            {generate.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
            <span>Generate Build Pack</span>
          </Button>
        )}
      </section>

      {founderOrTeam && (
        <div className="flex border-b border-border-remorra/60 overflow-x-auto pb-px gap-2">
          {tabs.map((item) => {
            const isActive = tab === item;
            return (
              <button
                key={item}
                onClick={() => setTab(item)}
                className={`relative px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors duration-200 cursor-pointer ${
                  isActive ? "text-accent" : "text-muted hover:text-ink"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-venture-tab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
                    transition={{ type: "spring", stiffness: 350, damping: 28 }}
                  />
                )}
                <span>{item}</span>
              </button>
            );
          })}
        </div>
      )}

      {(tab === "board" || !founderOrTeam) && (
        <div className="flex flex-col gap-6">
          {founderOrTeam && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* New Story Form */}
              <Card className="p-5 flex flex-col gap-3.5 bg-surface border-border-remorra/70 shadow-sm">
                <h3 className="text-xs font-bold text-ink uppercase tracking-wider">New story</h3>
                <div className="flex gap-2">
                  <Input
                    className="flex-1 h-9 border border-border-remorra rounded-lg bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                    value={storyTitle}
                    onChange={(event) => setStoryTitle(event.target.value)}
                    placeholder={data?.userNeeds?.length ? "Story title" : "Create a User Need in Refine first"}
                    disabled={!data?.userNeeds?.length}
                  />
                  <Button
                    className="h-9 px-4 flex-shrink-0"
                    disabled={!data?.userNeeds?.length || storyTitle.trim().length < 2 || command.isPending}
                    onClick={() =>
                      submit(
                        "/stories",
                        { userNeedId: data.userNeeds[0].id, title: storyTitle, acceptance: [], priority: "medium" },
                        () => setStoryTitle(""),
                      )
                    }
                  >
                    Add
                  </Button>
                </div>
              </Card>

              {/* New Task Form */}
              <Card className="p-5 flex flex-col gap-3.5 bg-surface border-border-remorra/70 shadow-sm">
                <h3 className="text-xs font-bold text-ink uppercase tracking-wider">New task</h3>
                <div className="flex gap-2">
                  <Input
                    className="flex-1 h-9 border border-border-remorra rounded-lg bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
                    id="new-task"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={defaultStory ? "Task title" : "Create a story first"}
                    disabled={!defaultStory}
                  />
                  <Button
                    className="h-9 px-4 flex-shrink-0"
                    disabled={!defaultStory || title.trim().length < 2 || command.isPending}
                    onClick={() =>
                      submit(
                        "/tasks",
                        { storyId: defaultStory, cycleId: activeCycle?.id, title, priority: "medium" },
                        () => setTitle(""),
                      )
                    }
                  >
                    Add
                  </Button>
                </div>
              </Card>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-border-remorra/40 pb-2">
            <div className="flex items-center gap-1.5 text-xs text-muted font-semibold">
              <CalendarDays size={14} className="text-accent" />
              <span>{activeCycle?.name ?? "No active cycle"}</span>
            </div>
          </div>

          {/* Kanban Board */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {columns.map((status) => {
              const columnTasks = tasks.filter((task: any) => task.status === status);
              return (
                <div className="p-4 rounded-xl bg-surface-2 border border-border-remorra shadow-inner flex flex-col gap-3 min-h-[480px]" key={status}>
                  <div className="flex justify-between items-center pb-2 border-b border-border-remorra/50">
                    <strong className="text-[11px] font-bold text-ink uppercase tracking-wider">
                      {status.replace("_", " ")}
                    </strong>
                    <Badge tone="neutral">{columnTasks.length}</Badge>
                  </div>

                  <div className="flex flex-col gap-2.5">
                    <AnimatePresence>
                      {columnTasks.map((task: any, index: number) => (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ type: "spring", stiffness: 350, damping: 25, delay: index * 0.04 }}
                          key={task.id}
                        >
                          <Card className="p-3.5 shadow-sm border border-border-remorra/60 flex flex-col gap-3 bg-surface hover:shadow-md hover:border-[#b8c2ba] transition-all duration-200">
                            <div className="flex justify-between items-center">
                              <Badge tone="neutral">{task.priority}</Badge>
                              <button
                                className="w-6 h-6 rounded-md hover:bg-red-soft/20 text-muted hover:text-red flex items-center justify-center transition-colors cursor-pointer"
                                aria-label="Delete task"
                                onClick={() =>
                                  command.mutate({ path: `/tasks/${task.id}`, method: "DELETE", version: task.version })
                                }
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                            
                            <h3 className="text-xs font-bold text-ink leading-relaxed font-sans min-h-[40px] flex items-center">
                              {task.title}
                            </h3>
                            
                            <footer className="flex justify-between items-center border-t border-border-remorra/40 pt-2.5 mt-1 text-[9px] text-muted">
                              <span className="truncate max-w-[120px] font-semibold">
                                {task.story?.title ?? "Connected story"}
                              </span>
                              {status !== "done" && (
                                <button
                                  className="w-6 h-6 rounded-md hover:bg-accent-soft/40 text-accent flex items-center justify-center transition-colors cursor-pointer"
                                  aria-label="Move task forward"
                                  onClick={() =>
                                    command.mutate({
                                      path: `/tasks/${task.id}/move`,
                                      method: "PATCH",
                                      body: {
                                        status: columns[columns.indexOf(status) + 1],
                                        position: task.position,
                                        version: task.version,
                                      },
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

                    {columnTasks.length === 0 && (
                      <div className="text-center py-12 text-[10px] text-muted border border-dashed border-border-remorra/40 rounded-xl">
                        No tasks
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </div>
      )}

      {tab === "cycles" && (
        <WorkspaceList
          title="Cycles"
          placeholder="Cycle name"
          value={cycleName}
          onValue={setCycleName}
          onAdd={() =>
            submit(
              "/cycles",
              {
                name: cycleName,
                startsAt: `${today}T00:00:00.000Z`,
                endsAt: new Date(Date.now() + 14 * 86400000).toISOString(),
                isBuildCycle: false,
              },
              () => setCycleName(""),
            )
          }
          items={(data?.cycles ?? []).map((item: any) => ({
            ...item,
            subtitle: `${item.status}${item.isBuildCycle ? " · Build cycle" : ""}`,
            action:
              item.status !== "active" ? (
                <Button variant="secondary" className="h-8 text-[11px]" onClick={() => command.mutate({ path: `/cycles/${item.id}/activate` })}>
                  Activate
                </Button>
              ) : null,
          }))}
        />
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
          }))}
        />
      )}

      {tab === "finance" && (
        <div className="flex flex-col gap-6">
          <WorkspaceList
            title="Finance categories"
            placeholder="Category name"
            value={categoryName}
            onValue={setCategoryName}
            onAdd={() => submit("/finance/categories", { name: categoryName, type: "cost" }, () => setCategoryName(""))}
            items={(data?.financeCategories ?? []).map((item: any) => ({
              ...item,
              title: item.name,
              subtitle: item.type,
            }))}
          />
          <WorkspaceList
            title="Finance entries"
            placeholder={data?.financeCategories?.length ? "Entry description" : "Create a category first"}
            value={financeDescription}
            onValue={setFinanceDescription}
            onAdd={() =>
              submit(
                "/finance",
                {
                  categoryId: data.financeCategories[0].id,
                  description: financeDescription,
                  amountMinor: 0,
                  currency: "GBP",
                  occurredAt: new Date().toISOString(),
                },
                () => setFinanceDescription(""),
              )
            }
            disabled={!data?.financeCategories?.length}
            items={(data?.financeEntries ?? []).map((item: any) => ({
              ...item,
              title: item.description,
              subtitle: `${item.category?.name ?? "Finance"} · ${(item.amountMinor / 100).toFixed(2)} ${item.currency}`,
            }))}
          />
        </div>
      )}

      {tab === "meetings" && (
        <WorkspaceList
          title="Daily meetings"
          placeholder="What is the team doing today?"
          value={meetingText}
          onValue={setMeetingText}
          onAdd={() =>
            submit(
              "/meetings",
              { cycleId: activeCycle?.id, meetingDate: new Date().toISOString(), today: meetingText },
              () => setMeetingText(""),
            )
          }
          items={(data?.meetings ?? []).map((item: any) => ({
            ...item,
            title: new Date(item.meetingDate).toLocaleDateString(),
            subtitle: item.today ?? "No notes",
            action: (
              <Button
                variant="secondary"
                className="h-8 text-[11px] flex items-center gap-1"
                disabled={generate.isPending}
                onClick={() => generate.mutate({ path: `/meetings/${item.id}/generate-summary` })}
              >
                {generate.isPending ? <LoaderCircle size={12} className="animate-spin" /> : null}
                <span>Summarize</span>
              </Button>
            ),
          }))}
        />
      )}

      {tab === "retrospectives" && (
        <WorkspaceList
          title="Retrospectives"
          placeholder="What did we learn?"
          value={retroText}
          onValue={setRetroText}
          onAdd={() =>
            submit(
              "/retrospectives",
              { cycleId: activeCycle?.id, wentWell: retroText, improvements: "", actions: "" },
              () => setRetroText(""),
            )
          }
          items={(data?.retrospectives ?? []).map((item: any) => ({
            ...item,
            title: item.wentWell,
            subtitle: item.actions || "No actions yet",
            action: (
              <Button
                variant="secondary"
                className="h-8 text-[11px] flex items-center gap-1"
                disabled={generate.isPending}
                onClick={() => generate.mutate({ path: `/retrospectives/${item.id}/generate-insights` })}
              >
                {generate.isPending ? <LoaderCircle size={12} className="animate-spin" /> : null}
                <span>Generate insights</span>
              </Button>
            ),
          }))}
        />
      )}
    </div>
  );
}

function WorkspaceList({ title, placeholder, value, onValue, onAdd, items, disabled = false }: any) {
  return (
    <Card className="overflow-hidden flex flex-col border-border-remorra/70 shadow-sm bg-surface">
      <div className="h-[50px] px-5 border-b border-border-remorra flex items-center justify-between bg-surface-2">
        <h2 className="text-xs font-bold text-ink uppercase tracking-wide">{title}</h2>
        <Badge tone="neutral">{items.length}</Badge>
      </div>
      
      <div className="p-4 bg-surface-2 border-b border-border-remorra/40 flex gap-2">
        <Input
          className="flex-1 h-9 border border-border-remorra rounded-lg bg-white px-3 text-xs focus:outline-none focus:ring-2 focus:ring-accent/20"
          value={value}
          onChange={(event) => onValue(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
        <Button
          className="h-9 px-4 flex items-center gap-1"
          disabled={disabled || value.trim().length < 2}
          onClick={onAdd}
        >
          <Plus size={14} />
          <span>Add</span>
        </Button>
      </div>

      <div className="divide-y divide-border-remorra/40">
        {items.length ? (
          items.map((item: any, index: number) => (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              className="p-3.5 flex justify-between items-center text-xs gap-4"
              key={item.id}
            >
              <div>
                <strong className="block text-xs font-semibold text-ink leading-tight">
                  {item.title ?? item.name}
                </strong>
                <small className="block text-[10px] text-muted font-medium mt-0.5">{item.subtitle}</small>
              </div>
              {item.action}
            </motion.div>
          ))
        ) : (
          <div className="p-8 text-center text-xs text-muted leading-relaxed">
            Nothing here yet.
          </div>
        )}
      </div>
    </Card>
  );
}

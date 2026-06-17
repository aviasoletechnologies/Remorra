import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, CircleDollarSign, ClipboardList, ListChecks, MessageSquareText, Plus, RefreshCcw, ShieldAlert, Sparkles, Trash2, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { api, waitForJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card, Input } from "../components/ui";
import { AppTabs, DisabledOverlay, Page, PageHeader, SectionCard, KanbanSkeleton, TableSkeleton } from "../components/app-ui";
import { Skeleton } from "../components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";

const columns = ["ready", "in_progress", "review", "done"] as const;
const tabs = ["board", "cycles", "raid", "finance", "meetings", "retrospectives"] as const;
const tabItems = [
  { value: "board", label: "Board", icon: ListChecks },
  { value: "cycles", label: "Cycles", icon: RefreshCcw },
  { value: "raid", label: "RAID", icon: ShieldAlert },
  { value: "finance", label: "Finance", icon: CircleDollarSign },
  { value: "meetings", label: "Meetings", icon: MessageSquareText },
  { value: "retrospectives", label: "Retrospectives", icon: ClipboardList },
] satisfies Array<{ value: (typeof tabs)[number]; label: string; icon: any }>;

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


  const tasks = data?.tasks ?? [];
  const stories = data?.stories ?? [];
  const defaultStory = stories[0]?.id;
  const activeCycle = data?.cycles?.find((cycle: any) => cycle.status === "active");
  const founderOrTeam = data?.role !== "supplier";
  const today = new Date().toISOString().slice(0, 10);

  const submit = (path: string, body: any, clear: () => void) => {
    command.mutate({ path, body }, { onSuccess: clear });
  };

  const pageTitle = isLoading 
    ? "Delivery workspace" 
    : (data?.role === "supplier" ? "My assigned tasks" : "Delivery workspace");

  return (
    <Page className="relative min-h-[500px]">
      <div className="flex flex-col gap-6 pointer-events-none select-none opacity-75">
        <PageHeader
          eyebrow="Venture"
          tone="blue"
          title={pageTitle}
          description="Cycles, delivery evidence, risk, finance, meetings, and learning in one connected view."
          actions={founderOrTeam ? (
            <Button
              disabled={generate.isPending || isLoading}
              onClick={() => generate.mutate({ path: "/build-pack" })}
              className="flex items-center gap-1.5 flex-shrink-0"
            >
              {generate.isPending ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}
              <span>Generate Build Pack</span>
            </Button>
          ) : undefined}
        />

        {founderOrTeam && (
          <AppTabs value={tab} items={tabItems} onChange={setTab} />
        )}

        {isLoading ? (
          tab === "board" ? (
            <div className="flex flex-col gap-6 animate-pulse">
              {founderOrTeam && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Card className="p-5 flex flex-col gap-3">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-3 w-48 mb-2" />
                    <div className="flex gap-2">
                      <Skeleton className="h-10 flex-grow" />
                      <Skeleton className="h-10 w-20" />
                    </div>
                  </Card>
                  <Card className="p-5 flex flex-col gap-3">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-3 w-48 mb-2" />
                    <div className="flex gap-2">
                      <Skeleton className="h-10 flex-grow" />
                      <Skeleton className="h-10 w-20" />
                    </div>
                  </Card>
                </div>
              )}
              <div className="flex items-center justify-between border-b border-border pb-2">
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                {columns.map((colStatus) => (
                  <div className="flex min-h-[460px] flex-col gap-3 rounded-2xl border border-border bg-secondary/35 p-3" key={colStatus}>
                    <div className="flex justify-between items-center pb-2 border-b border-border">
                      <Skeleton className="h-4 w-16" />
                      <Skeleton className="h-4 w-6 rounded-full" />
                    </div>
                    <div className="flex flex-col gap-2.5">
                      <Card className="p-4 flex flex-col gap-3 bg-card">
                        <div className="flex justify-between items-center">
                          <Skeleton className="h-4.5 w-12 rounded-full" />
                          <Skeleton className="size-4" />
                        </div>
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-5/6" />
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-border/40">
                          <Skeleton className="h-3 w-16" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                      </Card>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <TableSkeleton rows={5} columns={4} />
            </div>
          )
        ) : (
          <>

        {(tab === "board" || !founderOrTeam) && (
          <div className="flex flex-col gap-6">
            {founderOrTeam && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SectionCard title="New story" description="Connect delivery to the first available User Need">
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
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
                </SectionCard>

                <SectionCard title="New task" description="Add work to the active cycle and board">
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
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
                </SectionCard>
              </div>
            )}

            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                <CalendarDays size={14} className="text-primary" />
                <span>{activeCycle?.name ?? "No active cycle"}</span>
              </div>
            </div>

            {/* Kanban Board */}
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {columns.map((status) => {
                const columnTasks = tasks.filter((task: any) => task.status === status);
                return (
                  <div className="flex min-h-[460px] flex-col gap-3 rounded-2xl border border-border bg-secondary/55 p-3 shadow-inner" key={status}>
                    <div className="flex justify-between items-center pb-2 border-b border-border">
                      <strong className="text-[11px] font-bold text-foreground uppercase tracking-wider">
                        {status.replace("_", " ")}
                      </strong>
                      <Badge tone="neutral">{columnTasks.length}</Badge>
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <AnimatePresence>
                        {columnTasks.map((task: any) => (
                          <motion.div
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            key={task.id}
                          >
                            <Card className="p-3.5 flex flex-col gap-3 bg-card hover:border-primary/25 hover:shadow-md transition-[border-color,box-shadow] duration-200">
                              <div className="flex justify-between items-center">
                                <Badge tone="neutral">{task.priority}</Badge>
                                <button
                                  className="w-6 h-6 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex items-center justify-center transition-colors cursor-pointer"
                                  aria-label="Delete task"
                                  onClick={() =>
                                    command.mutate({ path: `/tasks/${task.id}`, method: "DELETE", version: task.version })
                                  }
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                              
                              <h3 className="text-xs font-bold text-foreground leading-relaxed font-sans min-h-[40px] flex items-center">
                                {task.title}
                              </h3>
                              
                              <footer className="flex justify-between items-center border-t border-border pt-2.5 mt-1 text-[9px] text-muted-foreground">
                                <span className="truncate max-w-[120px] font-semibold">
                                  {task.story?.title ?? "Connected story"}
                                </span>
                                {status !== "done" && (
                                  <button
                                    className="w-6 h-6 rounded-md hover:bg-accent-soft/40 text-primary flex items-center justify-center transition-colors cursor-pointer"
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
                        <div className="rounded-xl border border-dashed border-border py-12 text-center text-[10px] text-muted-foreground">
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
          </>
        )}
      </div>
      <DisabledOverlay message="Admin has disabled Build Pack generation and task management." />
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
          <Plus size={14} />
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

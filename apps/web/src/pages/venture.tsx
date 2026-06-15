import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronRight, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, waitForJob } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card } from "../components/ui";

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
  if (isLoading) return <div className="page loading-page">Loading delivery...</div>;
  const tasks = data?.tasks ?? [];
  const stories = data?.stories ?? [];
  const defaultStory = stories[0]?.id;
  const activeCycle = data?.cycles?.find((cycle: any) => cycle.status === "active");
  const founderOrTeam = data?.role !== "supplier";
  const today = new Date().toISOString().slice(0, 10);
  const submit = (path: string, body: any, clear: () => void) => {
    command.mutate({ path, body }, { onSuccess: clear });
  };

  return <div className="page">
    <section className="page-heading compact-heading"><div><Badge tone="blue">Venture</Badge><h1>{data?.role === "supplier" ? "My assigned tasks" : "Delivery workspace"}</h1><p>Cycles, delivery evidence, risk, finance, meetings, and learning in one connected view.</p></div>{founderOrTeam && <Button disabled={generate.isPending} onClick={() => generate.mutate({ path: "/build-pack" })}><Sparkles size={16} />Generate Build Pack</Button>}</section>
    {founderOrTeam && <div className="tab-strip">{tabs.map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}</button>)}</div>}

    {(tab === "board" || !founderOrTeam) && <>
      {founderOrTeam && <div className="venture-create-grid">
        <Card className="quick-create"><h3>New story</h3><input value={storyTitle} onChange={(event) => setStoryTitle(event.target.value)} placeholder={data?.userNeeds?.length ? "Story title" : "Create a User Need in Refine first"} disabled={!data?.userNeeds?.length} /><Button disabled={!data?.userNeeds?.length || storyTitle.trim().length < 2} onClick={() => submit("/stories", { userNeedId: data.userNeeds[0].id, title: storyTitle, acceptance: [], priority: "medium" }, () => setStoryTitle(""))}>Add story</Button></Card>
        <Card className="quick-create"><h3>New task</h3><input id="new-task" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={defaultStory ? "Task title" : "Create a story first"} disabled={!defaultStory} /><Button disabled={!defaultStory || title.trim().length < 2} onClick={() => submit("/tasks", { storyId: defaultStory, cycleId: activeCycle?.id, title, priority: "medium" }, () => setTitle(""))}>Add task</Button></Card>
      </div>}
      <div className="board-toolbar"><div className="cycle-date"><CalendarDays size={15} />{activeCycle?.name ?? "No active cycle"}</div></div>
      <section className="kanban-board">{columns.map((status) => <div className="kanban-column" key={status}><div className="kanban-column__header"><strong>{status.replace("_", " ")}</strong><span>{tasks.filter((task: any) => task.status === status).length}</span></div>{tasks.filter((task: any) => task.status === status).map((task: any) => <Card className="task-card" key={task.id}><div><Badge tone="neutral">{task.priority}</Badge><button className="icon-button" aria-label="Delete task" onClick={() => command.mutate({ path: `/tasks/${task.id}`, method: "DELETE", version: task.version })}><Trash2 size={14} /></button></div><h3>{task.title}</h3><footer><span>{task.story?.title ?? "Connected story"}</span>{status !== "done" && <button className="icon-button" aria-label="Move task forward" onClick={() => command.mutate({ path: `/tasks/${task.id}/move`, method: "PATCH", body: { status: columns[columns.indexOf(status) + 1], position: task.position, version: task.version } })}><ChevronRight size={16} /></button>}</footer></Card>)}{tasks.filter((task: any) => task.status === status).length === 0 && <div className="empty-column">No tasks</div>}</div>)}</section>
    </>}

    {tab === "cycles" && <WorkspaceList title="Cycles" placeholder="Cycle name" value={cycleName} onValue={setCycleName} onAdd={() => submit("/cycles", { name: cycleName, startsAt: `${today}T00:00:00.000Z`, endsAt: new Date(Date.now() + 14 * 86400000).toISOString(), isBuildCycle: false }, () => setCycleName(""))} items={(data?.cycles ?? []).map((item: any) => ({ ...item, subtitle: `${item.status}${item.isBuildCycle ? " · Build cycle" : ""}`, action: item.status !== "active" ? <Button variant="secondary" onClick={() => command.mutate({ path: `/cycles/${item.id}/activate` })}>Activate</Button> : null }))} />}
    {tab === "raid" && <WorkspaceList title="RAID register" placeholder="Risk, assumption, issue, or dependency" value={raidTitle} onValue={setRaidTitle} onAdd={() => submit("/raid", { type: "risk", title: raidTitle, severity: "amber" }, () => setRaidTitle(""))} items={(data?.raid ?? []).map((item: any) => ({ ...item, subtitle: `${item.type} · ${item.status} · ${item.severity}` }))} />}
    {tab === "finance" && <><WorkspaceList title="Finance categories" placeholder="Category name" value={categoryName} onValue={setCategoryName} onAdd={() => submit("/finance/categories", { name: categoryName, type: "cost" }, () => setCategoryName(""))} items={(data?.financeCategories ?? []).map((item: any) => ({ ...item, title: item.name, subtitle: item.type }))} /><WorkspaceList title="Finance entries" placeholder={data?.financeCategories?.length ? "Entry description" : "Create a category first"} value={financeDescription} onValue={setFinanceDescription} onAdd={() => submit("/finance", { categoryId: data.financeCategories[0].id, description: financeDescription, amountMinor: 0, currency: "GBP", occurredAt: new Date().toISOString() }, () => setFinanceDescription(""))} disabled={!data?.financeCategories?.length} items={(data?.financeEntries ?? []).map((item: any) => ({ ...item, title: item.description, subtitle: `${item.category?.name ?? "Finance"} · ${(item.amountMinor / 100).toFixed(2)} ${item.currency}` }))} /></>}
    {tab === "meetings" && <WorkspaceList title="Daily meetings" placeholder="What is the team doing today?" value={meetingText} onValue={setMeetingText} onAdd={() => submit("/meetings", { cycleId: activeCycle?.id, meetingDate: new Date().toISOString(), today: meetingText }, () => setMeetingText(""))} items={(data?.meetings ?? []).map((item: any) => ({ ...item, title: new Date(item.meetingDate).toLocaleDateString(), subtitle: item.today ?? "No notes", action: <Button variant="secondary" onClick={() => generate.mutate({ path: `/meetings/${item.id}/generate-summary` })}>Summarize</Button> }))} />}
    {tab === "retrospectives" && <WorkspaceList title="Retrospectives" placeholder="What did we learn?" value={retroText} onValue={setRetroText} onAdd={() => submit("/retrospectives", { cycleId: activeCycle?.id, wentWell: retroText, improvements: "", actions: "" }, () => setRetroText(""))} items={(data?.retrospectives ?? []).map((item: any) => ({ ...item, title: item.wentWell, subtitle: item.actions || "No actions yet", action: <Button variant="secondary" onClick={() => generate.mutate({ path: `/retrospectives/${item.id}/generate-insights` })}>Generate insights</Button> }))} />}
  </div>;
}

function WorkspaceList({ title, placeholder, value, onValue, onAdd, items, disabled = false }: any) {
  return <Card className="workspace-list"><div className="panel-heading"><h2>{title}</h2><Badge tone="neutral">{items.length}</Badge></div><div className="quick-create"><input value={value} onChange={(event) => onValue(event.target.value)} placeholder={placeholder} disabled={disabled} /><Button disabled={disabled || value.trim().length < 2} onClick={onAdd}><Plus size={15} />Add</Button></div>{items.length ? <div className="stack-list">{items.map((item: any) => <div className="list-row" key={item.id}><div><strong>{item.title ?? item.name}</strong><small>{item.subtitle}</small></div>{item.action}</div>)}</div> : <div className="empty-state">Nothing here yet.</div>}</Card>;
}

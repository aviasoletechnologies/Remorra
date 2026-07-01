import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ListChecks, ShieldAlert, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card, Input } from "../components/ui";
import { AppTabs, DisabledOverlay, Page, PageHeader, SectionCard, TableSkeleton } from "../components/app-ui";
import { Skeleton } from "../components/ui/skeleton";
import { motion, AnimatePresence } from "framer-motion";

const columns = ["ready", "in_progress", "review", "done"] as const;
const tabs = ["board", "raid"] as const;
const tabItems = [
  { value: "board", label: "Backlog", icon: ListChecks },
  { value: "raid", label: "RAID", icon: ShieldAlert },
] satisfies Array<{ value: (typeof tabs)[number]; label: string; icon: any }>;

export function VenturePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>("board");
  const [raidTitle, setRaidTitle] = useState("");

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

  const stories = data?.stories ?? [];
  const founderOrTeam = Boolean(data?.role);

  const submit = (path: string, body: any, clear: () => void) => {
    command.mutate({ path, body }, { onSuccess: clear });
  };

  return (
    <Page className="relative min-h-[500px]">
      <div className="flex flex-col gap-6 pointer-events-none select-none opacity-75">
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
                                <div className="flex justify-between items-center">
                                  <Badge tone="neutral">{story.priority}</Badge>
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
          </>
        )}
      </div>
      <DisabledOverlay message="Admin has disabled delivery workspace access." />
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

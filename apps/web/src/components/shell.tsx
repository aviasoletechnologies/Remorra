import {
  Bell,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  FileChartColumn,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogOut,
  MessageSquareText,
  PanelLeft,
  ShieldCheck,
  Sparkles,
  Users,
  Terminal,
  Copy,
  CheckCircle2,
  XCircle,
  X,
  Cpu,
  GitBranch,
  Play,
  Trash2,
  ChevronRight,
  Activity,
  Plus,
  Loader2,
  History,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useLocation } from "react-router-dom";
import { drivePhases } from "@remorra/ui";
import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api, streamRecentJobs } from "../lib/api";
import { useWorkspaceStore, type LogEvent } from "../lib/store";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";
import { motionTransition } from "../lib/motion";
import { Avatar, Badge, Button, Card } from "./ui";
import { buttonVariants } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { EmptyState } from "./app-ui";
import { EvolvePanel } from "./evolve-panel";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "./ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface Project {
  id: string;
  name: string;
  phase: string;
  role: "founder" | "team";
  healthScore: number | null;
}

interface Actor {
  email?: string;
  fullName?: string;
  platformRole?: "user" | "admin" | "support";
  privacyPolicyVersion?: string;
  termsVersion?: string;
}

interface Job {
  id: string;
  queue: string;
  status: string;
}

const pageNames: Record<string, string> = {
  "/": "Overview",
  "/workspace": "AI product guide",
  "/initiate": "Initiate",
  "/venture": "Delivery",
  "/reports": "Reports & packs",
  "/team": "People & access",
  "/knowledge": "Product library",
  "/history": "Conversation history",
  "/privacy": "Privacy & data",
  "/admin": "Platform admin",
};

export function Shell({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (location.pathname.startsWith("/invitations/") || location.pathname === "/reset-password") {
    return children;
  }

  return (
    <SidebarProvider defaultOpen>
      <WorkspaceShell>{children}</WorkspaceShell>
    </SidebarProvider>
  );
}

function WorkspaceShell({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [isEvolveOpen, setIsEvolveOpen] = useState(false);
  const { data: projects = [], error: projectsError } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/projects"),
    retry: true,
    retryDelay: 1500,
  });
  const { data: actor } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<Actor>("/auth/me"),
    retry: true,
    retryDelay: 1500,
  });
  const { data: jobs = [] } = useQuery({
    queryKey: ["recent-jobs"],
    queryFn: () => api<Job[]>("/jobs"),
  });

  useEffect(() => {
    const unsubscribe = streamRecentJobs((newJobs) => {
      queryClient.setQueryData(["recent-jobs"], newJobs);
    });
    return unsubscribe;
  }, [queryClient]);
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId);
  const setActiveProjectId = useWorkspaceStore((state) => state.setActiveProjectId);
  const logs = useWorkspaceStore((state) => state.logs);
  const streamState = useWorkspaceStore((state) => state.streamState);
  const isLogsOpen = useWorkspaceStore((state) => state.isLogsOpen);
  const setLogsOpen = useWorkspaceStore((state) => state.setLogsOpen);
  const clearLogs = useWorkspaceStore((state) => state.clearLogs);
  const setLogs = useWorkspaceStore((state) => state.setLogs);

  const logsEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isLogsOpen) {
      setTimeout(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  }, [logs.length, isLogsOpen]);

  useEffect(() => {
    if (isLogsOpen && logs.length === 0 && streamState === "idle" && activeProjectId) {
      api<LogEvent[]>(`/jobs/projects/${activeProjectId}/recent-events`)
        .then((fetchedLogs) => {
          if (fetchedLogs && fetchedLogs.length > 0) {
            setLogs(fetchedLogs);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch historical logs", err);
        });
    }
  }, [isLogsOpen, activeProjectId, logs.length, streamState, setLogs]);

  const createProject = useMutation({
    mutationFn: (name: string) =>
      api<{ id: string }>("/projects", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setActiveProjectId(data.id);
      setIsCreateModalOpen(false);
      setNewProjectName("");
    },
  });

  const consent = useMutation({
    mutationFn: () =>
      api("/auth/consent", {
        method: "POST",
        body: JSON.stringify({ privacyPolicyVersion: "2026-06-15", termsVersion: "2026-06-15" }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  const project = projects.find((item) => item.id === activeProjectId) ?? projects[0];
  useEffect(() => {
    if (project && project.id !== activeProjectId) setActiveProjectId(project.id);
  }, [activeProjectId, project, setActiveProjectId]);

  const navItems = useMemo(() => {
    if (!project) return [];
    const items = [
      { to: "/", label: "Overview", icon: LayoutDashboard },
      { to: "/workspace", label: "AI product guide", icon: MessageSquareText },
      { to: "/initiate", label: "Initiate", icon: Gauge },
      { to: "/venture", label: "Delivery", icon: ListChecks },
      { to: "/reports", label: "Reports & packs", icon: FileChartColumn },
      { to: "/team", label: "People & access", icon: Users },
      { to: "/knowledge", label: "Product library", icon: BookOpen },
      { to: "/history", label: "Conversation history", icon: History },
    ];

    const filtered = items.filter((item) => {
      if (item.to === "/workspace") return ["discover", "refine"].includes(project.phase);
      if (item.to === "/initiate") return ["initiate"].includes(project.phase);
      if (item.to === "/venture" || item.to === "/reports") return ["venture", "evolve"].includes(project.phase);
      return true;
    });

    if (actor && ["admin", "support"].includes(actor.platformRole ?? "")) {
      filtered.push({ to: "/admin", label: "Platform admin", icon: ShieldCheck });
    }
    return filtered;
  }, [actor, project?.phase]);

  if (actor && (!actor.privacyPolicyVersion || !actor.termsVersion)) {
    return (
      <main className="configuration-page w-full bg-background relative overflow-hidden">
        {/* Soft background radial glows */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />
        
        <Card className="max-w-lg w-full p-8 flex flex-col items-center text-center gap-6 shadow-[var(--shadow-card-hover)] border border-border/80 bg-card/85 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-300">
          <div className="brand-mark">R</div>
          <Badge tone="green" className="px-3 py-1 text-[10px] tracking-wider font-bold uppercase">Privacy choices</Badge>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Confirm how Remorra handles your data</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Remorra stores product conversations, generated documents, and usage evidence to provide the DRIVE workflow.
            You can export or schedule deletion from Privacy & data.
          </p>
          <Button className="w-full mt-2" disabled={consent.isPending} onClick={() => consent.mutate()}>
            {consent.isPending ? "Recording..." : "Accept terms and continue"}
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <>
      <Sidebar collapsible="icon" className="border-sidebar-border">
        <SidebarHeader className="gap-3 border-b border-sidebar-border p-3">
          <div className="flex h-11 items-center gap-3 px-1">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-sidebar-primary text-base font-extrabold text-sidebar-primary-foreground">R</div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <strong className="block text-lg font-bold tracking-[-.04em] text-white">remorra</strong>
              <span className="block text-[9px] font-semibold uppercase tracking-[.12em] text-sidebar-foreground/55">Product intelligence</span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button className="flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl border border-sidebar-border bg-sidebar-accent/65 p-2 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center" />
              }
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/35 text-xs font-bold text-white">
                {project?.name.slice(0, 1).toUpperCase() ?? "R"}
              </span>
              <span className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                <strong className="block truncate text-xs text-white">{project?.name ?? "Create a project"}</strong>
                <small className="block capitalize text-[10px] text-sidebar-foreground/55">{project?.role ?? "Founder workspace"}</small>
              </span>
              <ChevronDown size={14} className="text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden" />
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={8} className="min-w-64">
              <DropdownMenuLabel>Switch product workspace</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {projects.map((item) => (
                <DropdownMenuItem key={item.id} onClick={() => setActiveProjectId(item.id)} className="min-h-10 gap-3 px-2">
                  <span className="grid size-7 place-items-center rounded-md bg-accent-soft text-[10px] font-bold text-accent-dark">
                    {item.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {item.id === project?.id ? <Check size={14} className="text-primary" /> : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setIsCreateModalOpen(true)} className="min-h-10 gap-3 px-2 text-primary">
                <span className="grid size-7 place-items-center rounded-md border border-dashed border-primary/40 bg-primary/5 text-[10px] font-bold text-primary">
                  <Plus size={14} />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">Create new workspace</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarHeader>

        <SidebarContent className="px-2 py-3">
          <SidebarGroup className="p-0">
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {navItems.map(({ to, label, icon: Icon }) => (
                  <SidebarMenuItem key={to}>
                    <SidebarMenuButton
                      render={<NavLink to={to} end={to === "/"} />}
                      isActive={to === "/" ? location.pathname === "/" : location.pathname.startsWith(to)}
                      tooltip={label}
                      className="h-10 gap-3 rounded-lg px-3 text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-white data-active:bg-sidebar-accent data-active:text-white"
                    >
                      <Icon size={17} />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {project ? (
            <div className="mx-2 mt-5 rounded-xl border border-sidebar-border bg-sidebar-accent/45 p-3 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[.1em] text-sidebar-foreground/55">DRIVE progress</span>
                <Badge tone="green">{project.phase}</Badge>
              </div>
              <div className="relative mt-4 flex justify-between before:absolute before:inset-x-3 before:top-3 before:h-px before:bg-sidebar-border">
                {drivePhases.map((phase, index) => {
                  const current = drivePhases.findIndex((item) => item.id === project.phase);
                  const complete = index <= current;
                  return (
                    <span
                      key={phase.id}
                      title={phase.label}
                      className={cn(
                        "relative z-10 grid size-6 place-items-center rounded-full border border-sidebar-border bg-sidebar text-[9px] font-bold text-sidebar-foreground/45",
                        complete && "border-primary/60 bg-primary/35 text-white",
                        index === current && "ring-2 ring-sidebar-primary/25",
                      )}
                    >
                      {phase.short}
                    </span>
                  );
                })}
              </div>
              <p className="mb-0 mt-3 text-[10px] leading-4 text-sidebar-foreground/50">
                Strategy and delivery evidence stay connected across each phase.
              </p>
            </div>
          ) : null}
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton render={<NavLink to="/privacy" />} isActive={location.pathname === "/privacy"} tooltip="Privacy & data" className="h-10 gap-3 px-3">
                <ShieldCheck size={17} /><span>Privacy & data</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Support" onClick={() => setSupportOpen((value) => !value)} className="h-10 gap-3 px-3">
                <CircleHelp size={17} /><span>Support</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sign out" onClick={() => void supabase?.auth.signOut()} className="h-10 gap-3 px-3">
                <LogOut size={17} /><span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="mt-2 flex items-center gap-3 rounded-xl bg-sidebar-accent/45 p-2 group-data-[collapsible=icon]:justify-center">
            <Avatar initials={initials(actor)} className="border-sidebar-border" />
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <strong className="block truncate text-xs text-white">{actor?.fullName ?? "Account"}</strong>
              <small className="block truncate text-[10px] text-sidebar-foreground/50">{actor?.email ?? project?.role ?? "member"}</small>
            </div>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="min-w-0 bg-transparent">
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border/70 bg-card/88 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger className="md:hidden" aria-label="Open navigation">
              <PanelLeft />
            </SidebarTrigger>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-medium text-muted-foreground">{project?.name ?? "Remorra"}</p>
              <strong className="block truncate text-sm tracking-[-.01em]">{pageNames[location.pathname] ?? "Workspace"}</strong>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {project?.healthScore != null ? (
              <div className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs text-muted-foreground shadow-xs sm:flex">
                <Gauge size={14} className="text-primary" />
                <span>Health Score</span>
                <strong className="text-foreground">{project.healthScore}</strong>
              </div>
            ) : null}
            {location.pathname === "/workspace" ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLogsOpen(!isLogsOpen)}
                className="relative text-muted-foreground hover:text-foreground cursor-pointer"
                title="View live backend logs"
              >
                <Terminal size={17} className={cn(streamState === "connected" && "animate-pulse text-primary")} />
                {streamState === "connected" && (
                  <span className="absolute right-2.5 top-2.5 size-2 rounded-full border-2 border-card bg-primary animate-ping" />
                )}
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" aria-label="Notifications" onClick={() => setNotificationsOpen((value) => !value)} className="relative">
              <Bell size={17} />
              {jobs.some((job) => ["queued", "running", "failed"].includes(job.status)) ? (
                <span className="absolute right-2.5 top-2.5 size-2 rounded-full border-2 border-card bg-destructive" />
              ) : null}
            </Button>
            {project && ["venture", "evolve"].includes(project.phase) ? (
              <Button
                variant={isEvolveOpen ? "default" : "ghost"}
                size="icon"
                aria-label="Evolve"
                onClick={() => setIsEvolveOpen((value) => !value)}
                title="Evolve — AI strategy assistant"
              >
                <Sparkles size={17} />
              </Button>
            ) : null}
            {project?.role === "founder" ? (
              <Link to="/workspace" className={cn(buttonVariants(), "hidden sm:inline-flex")}>
                <Sparkles size={14} /> Open AI guide
              </Link>
            ) : null}
          </div>
        </header>

        <AnimatePresence>
          {notificationsOpen ? (
            <FloatingPanel className="right-4 top-[72px] sm:right-6" title="Recent activity" onClose={() => setNotificationsOpen(false)}>
              {jobs.length ? jobs.slice(0, 8).map((job) => (
                <div className="flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-3" key={job.id}>
                  <span className="truncate text-xs font-semibold">{job.queue}</span>
                  <Badge tone={job.status === "completed" ? "green" : job.status === "failed" ? "red" : "amber"}>{job.status}</Badge>
                </div>
              )) : <p className="py-6 text-center text-xs text-muted-foreground">No recent background activity.</p>}
            </FloatingPanel>
          ) : null}
          {supportOpen ? (
            <FloatingPanel className="bottom-4 left-4 md:left-[calc(var(--sidebar-width)+1rem)]" title="Remorra support" onClose={() => setSupportOpen(false)}>
              <p className="text-xs leading-5 text-muted-foreground">
                Include your project, role, current screen, and the latest failed job ID when reporting an issue.
              </p>
              <a href="mailto:support@remorra.local" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>Email support</a>
            </FloatingPanel>
          ) : null}
        </AnimatePresence>

        <MovablePanel
          open={isLogsOpen}
          onClose={() => setLogsOpen(false)}
          title={
            <div className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Terminal className="size-4 text-primary animate-pulse" />
              Backend Execution Logs
            </div>
          }
          subtitle={
            <div className="text-xs text-zinc-400">
              Real-time activity of routing, skills, and model calls
            </div>
          }
          headerActions={
            <>
              <RunningTimer streamState={streamState} logs={logs} />
              <Badge
                className={cn(
                  "text-[9px] font-bold px-2 py-0.5 rounded-full border-0 uppercase tracking-wider",
                  streamState === "connected" && "bg-green-500/10 text-green-400 animate-pulse",
                  (streamState === "connecting" || streamState === "reconnecting") && "bg-amber-500/10 text-amber-400",
                  streamState === "idle" && "bg-zinc-800 text-zinc-400"
                )}
              >
                {streamState === "connected" ? "Streaming" : streamState === "connecting" || streamState === "reconnecting" ? "Connecting" : "Idle"}
              </Badge>
              {logs.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={clearLogs}
                  className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-850 cursor-pointer"
                  title="Clear logs"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </>
          }
        >
          <div className="flex-grow overflow-y-auto p-4 space-y-4 font-mono text-xs no-scrollbar">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3">
                  <div className="p-3 bg-zinc-900 rounded-full text-zinc-500">
                    <Activity className="size-6 animate-pulse text-zinc-600" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-zinc-300 font-medium font-sans">Awaiting execution...</h4>
                    <p className="text-[11px] text-zinc-500 font-sans max-w-[260px] leading-relaxed">
                      Logs will stream here automatically when you send a message in the chat workspace.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative border-l border-zinc-800 ml-3 pl-5 space-y-5">
                  {logs.map((log, index) => {
                    const isInfo = log.type === "info";
                    const isSuccess = log.metadata?.stage === "completed" || log.type === "completed";
                    const isError = log.type === "failed";
                    const stage = log.metadata?.stage;
                    const time = log.createdAt ? new Date(log.createdAt).toLocaleTimeString(undefined, {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      fractionalSecondDigits: 3
                    }) : "";

                    const deltaTime = getDeltaTime(index, log, logs);

                    return (
                      <LogItem
                        key={`${log.sequence}-${index}`}
                        log={log}
                        time={time}
                        deltaTime={deltaTime}
                        isInfo={isInfo}
                        isSuccess={isSuccess}
                        isError={isError}
                        stage={stage}
                      />
                    );
                  })}
                  <div ref={logsEndRef} />
                </div>
              )}
            </div>

            {logs.length > 0 && (
              <div className="border-t border-zinc-800 p-4 bg-zinc-900/50 space-y-3">
                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                  <span className="font-sans font-semibold text-zinc-300">Run Summary</span>
                  <span className="font-sans text-[10px] text-zinc-500 font-mono">#{logs[logs.length - 1]?.sequence} events</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-zinc-900 p-2.5 rounded-lg border border-zinc-800/60 flex flex-col gap-0.5">
                    <span className="text-[10px] text-zinc-500 font-sans">Active Skill</span>
                    <span className="font-semibold text-zinc-200 truncate flex items-center gap-1.5 font-sans">
                      <Sparkles className="size-3 text-primary" />
                      {getActiveSkillName(logs)}
                    </span>
                  </div>
                  <div className="bg-zinc-900 p-2.5 rounded-lg border border-zinc-800/60 flex flex-col gap-0.5">
                    <span className="text-[10px] text-zinc-500 font-sans">Model Details</span>
                    <span className="font-semibold text-zinc-200 truncate flex items-center gap-1.5 font-sans">
                      <Cpu className="size-3 text-emerald-400" />
                      {getModelName(logs)}
                    </span>
                  </div>
                </div>
                <div className="bg-zinc-900/80 p-2.5 rounded-lg border border-zinc-800/60 flex items-center justify-between">
                  <span className="text-[10px] text-zinc-500 font-sans">Est. Output Throughput</span>
                  <span className="font-semibold text-zinc-200 text-xs flex items-center gap-1 font-mono">
                    {getOutputTokens(logs)} <span className="text-[10px] text-zinc-500 font-sans font-normal">tokens</span>
                  </span>
                </div>
              </div>
            )}
        </MovablePanel>

        {project && isEvolveOpen && ["venture", "evolve"].includes(project.phase) ? (
          <div
            className="fixed right-4 top-[80px] z-50 flex h-[calc(100vh-100px)] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <EvolvePanel projectId={project.id} onClose={() => setIsEvolveOpen(false)} />
          </div>
        ) : null}

        {!project ? (
          <div className="page-container">
            <EmptyState
              title="Create your first product workspace"
              description={createProject.error?.message ?? projectsError?.message ?? "Name the product or venture. Remorra will begin in Discover."}
              action={
                <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
                  <input
                    className="h-10 min-w-0 flex-1 rounded-[10px] border border-input bg-card px-3 text-sm outline-none focus:ring-3 focus:ring-ring/15"
                    value={newProjectName}
                    onChange={(event) => setNewProjectName(event.target.value)}
                    placeholder="Product name"
                    aria-label="Product name"
                  />
                  <Button disabled={createProject.isPending || newProjectName.trim().length < 2} onClick={() => createProject.mutate(newProjectName)}>
                    {createProject.isPending ? "Creating..." : "Create project"}
                  </Button>
                </div>
              }
            />
          </div>
        ) : children}
        <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create new workspace</DialogTitle>
              <DialogDescription>Enter a name for your new product workspace. You will be automatically switched to it once created.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Input
                placeholder="e.g. Acme Co. Beta Platform"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                autoFocus
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createProject.mutate(newProjectName)}
                disabled={!newProjectName.trim() || createProject.isPending}
              >
                {createProject.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create Workspace
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </>
  );
}

function FloatingPanel({
  title,
  onClose,
  className,
  children,
}: {
  title: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: -6, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.985 }}
      transition={motionTransition}
      className={cn("fixed z-50 grid w-[min(360px,calc(100vw-2rem))] gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xl shadow-foreground/10", className)}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-bold">{title}</h2>
        <button onClick={onClose} className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground">Close</button>
      </div>
      {children}
    </motion.section>
  );
}

function initials(actor: Actor | undefined) {
  const source = actor?.fullName || actor?.email || "Account";
  return source.split(/[\s@]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

const getDeltaTime = (index: number, currentLog: LogEvent, allLogs: LogEvent[]) => {
  if (index === 0) return null;
  const prevLog = allLogs[index - 1];
  if (!prevLog || currentLog.sequence <= prevLog.sequence) {
    return null; // New sequence / first step of a new job run
  }
  const current = currentLog.createdAt ? new Date(currentLog.createdAt).getTime() : 0;
  const prev = prevLog.createdAt ? new Date(prevLog.createdAt).getTime() : 0;
  if (!current || !prev) return null;
  const diff = current - prev;
  if (diff < 0) return null;
  if (diff < 1000) return `+${diff}ms`;
  return `+${(diff / 1000).toFixed(2)}s`;
};

function RunningTimer({ streamState, logs }: { streamState: string; logs: LogEvent[] }) {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (streamState !== "idle") {
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
      const interval = setInterval(() => {
        setElapsed(Date.now() - (startTimeRef.current ?? Date.now()));
      }, 100);
      return () => clearInterval(interval);
    } else {
      startTimeRef.current = null;
    }
  }, [streamState]);

  const displayElapsed = useMemo(() => {
    if (streamState !== "idle") {
      return elapsed;
    }
    if (logs.length <= 1) return 0;
    
    let startIdx = 0;
    for (let i = logs.length - 1; i > 0; i--) {
      const currentLog = logs[i];
      const prevLog = logs[i - 1];
      if (currentLog && prevLog && currentLog.sequence <= prevLog.sequence) {
        startIdx = i;
        break;
      }
    }
    const firstLog = logs[startIdx];
    const lastLog = logs[logs.length - 1];
    const first = firstLog?.createdAt ? new Date(firstLog.createdAt).getTime() : 0;
    const last = lastLog?.createdAt ? new Date(lastLog.createdAt).getTime() : 0;
    
    return last && first ? Math.max(0, last - first) : 0;
  }, [streamState, elapsed, logs]);

  if (logs.length === 0) return null;

  return (
    <span className="text-[10px] font-mono text-zinc-400 bg-zinc-900 border border-zinc-800/80 px-2 py-0.5 rounded flex items-center gap-1.5 shadow-xs">
      <span className={cn("size-1.5 rounded-full", streamState !== "idle" ? "bg-emerald-500 animate-pulse" : "bg-zinc-650")} />
      <span>{(displayElapsed / 1000).toFixed(1)}s</span>
    </span>
  );
}

function MovablePanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  headerActions
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  headerActions?: React.ReactNode;
}) {
  const [position, setPosition] = useState({ x: window.innerWidth - 520, y: 80 });
  const [size, setSize] = useState({ width: 480, height: 650 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);

  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });
  const sizeStart = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const maxX = window.innerWidth - size.width - 20;
        const maxY = window.innerHeight - size.height - 20;
        return {
          x: Math.max(20, Math.min(prev.x, maxX)),
          y: Math.max(20, Math.min(prev.y, maxY)),
        };
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [size]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest(".no-drag")) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    posStart.current = { ...position };
    e.preventDefault();
  };

  const handleResizeStart = (e: React.MouseEvent, direction: string) => {
    if (e.button !== 0) return;
    setIsResizing(direction);
    dragStart.current = { x: e.clientX, y: e.clientY };
    sizeStart.current = { ...size };
    posStart.current = { ...position };
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        const nextX = Math.max(10, Math.min(posStart.current.x + dx, window.innerWidth - sizeStart.current.width - 10));
        const nextY = Math.max(10, Math.min(posStart.current.y + dy, window.innerHeight - sizeStart.current.height - 10));
        setPosition({ x: nextX, y: nextY });
      }

      if (isResizing) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        let newWidth = sizeStart.current.width;
        let newHeight = sizeStart.current.height;
        let newX = posStart.current.x;

        if (isResizing.includes("w")) {
          const possibleWidth = sizeStart.current.width - dx;
          if (possibleWidth >= 320 && possibleWidth <= 1000) {
            newWidth = possibleWidth;
            newX = posStart.current.x + dx;
          }
        }
        if (isResizing.includes("e")) {
          newWidth = Math.max(320, Math.min(sizeStart.current.width + dx, 1000));
        }
        if (isResizing.includes("s")) {
          newHeight = Math.max(400, Math.min(sizeStart.current.height + dy, window.innerHeight - posStart.current.y - 20));
        }

        setSize({ width: newWidth, height: newHeight });
        setPosition((prev) => ({ x: newX, y: prev.y }));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(null);
    };

    if (isDragging || isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex: 50,
      }}
      className="flex flex-col bg-zinc-950 text-zinc-50 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-md bg-zinc-950/90"
    >
      <div
        onMouseDown={handleMouseDown}
        className="cursor-move border-b border-zinc-900 p-4 flex items-center justify-between gap-4 select-none bg-zinc-950/40"
      >
        <div className="flex flex-col gap-0.5">
          {title}
          {subtitle}
        </div>
        <div className="flex items-center gap-2 pr-2 no-drag">
          {headerActions}
          <button
            onClick={onClose}
            className="cursor-pointer size-6 rounded-full border border-zinc-800 flex items-center justify-center text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>
      <div className="flex-grow flex flex-col min-h-0">
        {children}
      </div>
      <div onMouseDown={(e) => handleResizeStart(e, "w")} className="absolute left-0 top-0 bottom-0 w-1.5 cursor-w-resize hover:bg-primary/20 transition-colors animate-pulse" />
      <div onMouseDown={(e) => handleResizeStart(e, "e")} className="absolute right-0 top-0 bottom-0 w-1.5 cursor-e-resize hover:bg-primary/20 transition-colors animate-pulse" />
      <div onMouseDown={(e) => handleResizeStart(e, "s")} className="absolute bottom-0 left-0 right-0 h-1.5 cursor-s-resize hover:bg-primary/20 transition-colors animate-pulse" />
      <div onMouseDown={(e) => handleResizeStart(e, "sw")} className="absolute bottom-0 left-0 size-3 cursor-sw-resize hover:bg-primary/40 transition-colors z-20" />
      <div onMouseDown={(e) => handleResizeStart(e, "se")} className="absolute bottom-0 right-0 size-3 cursor-se-resize hover:bg-primary/40 transition-colors z-20" />
    </div>
  );
}

function LogItem({
  log,
  time,
  deltaTime,
  isInfo,
  isSuccess,
  isError,
  stage
}: {
  log: LogEvent;
  time: string;
  deltaTime?: string | null;
  isInfo: boolean;
  isSuccess: boolean;
  isError: boolean;
  stage?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"system" | "user" | "response">("system");
  const [tabCopied, setTabCopied] = useState(false);

  const hasRawAiData = !!(log.metadata?.rawInput || log.metadata?.rawOutput);

  // Determine which tabs are available
  const availableTabs = useMemo(() => {
    const list: { id: "system" | "user" | "response"; label: string; content: string }[] = [];
    if (log.metadata?.rawInput?.systemPrompt) {
      list.push({ id: "system", label: "System Prompt", content: log.metadata.rawInput.systemPrompt });
    }
    if (log.metadata?.rawInput?.userMessage) {
      list.push({ id: "user", label: "User Message", content: log.metadata.rawInput.userMessage });
    }
    if (log.metadata?.rawOutput) {
      list.push({ id: "response", label: "AI Response", content: log.metadata.rawOutput });
    }
    return list;
  }, [log.metadata]);

  // Sync activeTab if current active is not available
  useEffect(() => {
    if (hasRawAiData && availableTabs.length > 0) {
      const activeExists = availableTabs.some((t) => t.id === activeTab);
      const firstTab = availableTabs[0];
      if (firstTab && !activeExists) {
        setActiveTab(firstTab.id);
      }
    }
  }, [availableTabs, activeTab, hasRawAiData]);

  const activeContent = useMemo(() => {
    const tab = availableTabs.find((t) => t.id === activeTab);
    return tab ? tab.content : "";
  }, [availableTabs, activeTab]);

  const copyActiveTab = () => {
    if (activeContent) {
      void navigator.clipboard.writeText(activeContent);
      setTabCopied(true);
      setTimeout(() => setTabCopied(false), 2000);
    }
  };

  const copyMetadata = () => {
    if (log.metadata) {
      void navigator.clipboard.writeText(JSON.stringify(log.metadata, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const renderHighlightedText = (text: string) => {
    if (!text) return "";
    const parts = text.split(/(<[^>]+>)/g);
    return parts.map((part, index) => {
      if (part.startsWith("<") && part.endsWith(">")) {
        return (
          <span key={index} className="text-violet-400 font-bold">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  const getIcon = () => {
    if (isError) return <XCircle className="size-3 text-red-400" />;
    if (isSuccess) return <CheckCircle2 className="size-3 text-emerald-400" />;
    
    switch (stage) {
      case "start":
        return <Play className="size-3 text-blue-400 fill-blue-400/10" />;
      case "flow":
        return <GitBranch className="size-3 text-amber-400" />;
      case "routing":
        return <Cpu className="size-3 text-violet-400" />;
      case "invoking":
        return <Activity className="size-3 text-fuchsia-400" />;
      default:
        return <div className="size-1.5 rounded-full bg-zinc-500" />;
    }
  };

  const getBadge = () => {
    if (isError) return <span className="text-[9px] px-1.5 py-0.5 rounded border border-red-500/20 bg-red-500/5 text-red-400">ERROR</span>;
    if (isSuccess) return <span className="text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-emerald-400">SUCCESS</span>;
    if (isInfo) return <span className="text-[9px] px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/5 text-blue-400">INFO</span>;
    
    switch (stage) {
      case "start":
        return <span className="text-[9px] px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/5 text-blue-400">SYSTEM</span>;
      case "flow":
        return <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/5 text-amber-400">FLOW</span>;
      case "routing":
        return <span className="text-[9px] px-1.5 py-0.5 rounded border border-violet-500/20 bg-violet-500/5 text-violet-400">ROUTE</span>;
      case "invoking":
        return <span className="text-[9px] px-1.5 py-0.5 rounded border border-fuchsia-500/20 bg-fuchsia-500/5 text-fuchsia-400">MODEL</span>;
      default:
        return <span className="text-[9px] px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-400">LOG</span>;
    }
  };

  if (log.type === "token" || log.type === "snapshot") return null;

  return (
    <div className="relative group/log">
      <div className="absolute -left-[27px] top-1.5 size-4 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center z-10">
        {getIcon()}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {time && <span className="text-[10px] text-zinc-500 font-mono">{time}</span>}
          {getBadge()}
          {deltaTime && (
            <span className="text-[9px] px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900/50 text-zinc-400 font-mono">
              {deltaTime}
            </span>
          )}
          {log.metadata && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 font-sans cursor-pointer flex items-center gap-0.5 ml-auto"
            >
              {expanded ? "Hide payload" : "View payload"}
              <ChevronRight className={cn("size-2.5 transition-transform", expanded && "rotate-90")} />
            </button>
          )}
        </div>

        <p className="text-[11px] text-zinc-300 font-mono break-words leading-relaxed pr-2">
          {log.delta || log.snapshot}
        </p>

        {expanded && log.metadata && (
          <div className="relative mt-2 rounded-lg bg-zinc-900 border border-zinc-800 p-3 flex flex-col gap-2">
            {hasRawAiData ? (
              <>
                <div className="flex items-center justify-between border-b border-zinc-800 pb-1.5 flex-wrap gap-2">
                  <div className="flex gap-1 flex-wrap">
                    {availableTabs.map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                          "px-2 py-0.5 text-[10px] font-sans font-medium rounded transition-all cursor-pointer border",
                          activeTab === tab.id
                            ? "bg-zinc-800 text-zinc-100 border-zinc-700/80 shadow-sm"
                            : "text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-800/40"
                        )}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <button
                      onClick={copyActiveTab}
                      className="p-1 bg-zinc-950/60 rounded border border-zinc-800 hover:bg-zinc-855 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors flex items-center gap-1 text-[9px] font-sans px-2 h-6"
                      title={`Copy active ${activeTab} content`}
                    >
                      {tabCopied ? (
                        <>
                          <Check className="size-2.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-2.5" />
                          <span>Copy active</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={copyMetadata}
                      className="p-1 bg-zinc-950/60 rounded border border-zinc-800 hover:bg-zinc-855 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors flex items-center gap-1 text-[9px] font-sans px-2 h-6"
                      title="Copy full JSON payload"
                    >
                      {copied ? (
                        <>
                          <Check className="size-2.5 text-emerald-400" />
                          <span className="text-emerald-400">Full JSON Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="size-2.5" />
                          <span>Full JSON</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                <div className="relative">
                  <pre className="text-[10px] text-zinc-300 font-mono leading-relaxed whitespace-pre-wrap select-text break-all p-3 bg-zinc-950/80 rounded-md border border-zinc-800/80 max-h-80 overflow-y-auto no-scrollbar">
                    {renderHighlightedText(activeContent)}
                  </pre>
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={copyMetadata}
                  className="absolute top-2 right-2 p-1.5 bg-zinc-950/60 rounded-md border border-zinc-800/80 hover:bg-zinc-855 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
                  title="Copy JSON payload"
                >
                  {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
                </button>
                <div className="max-h-48 overflow-y-auto no-scrollbar">
                  <pre className="text-[10px] text-zinc-400 whitespace-pre-wrap font-mono leading-normal">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function getActiveSkillName(logs: LogEvent[]) {
  const routeEvent = logs.findLast((log) => log.type === "info" || log.metadata?.stage === "routing" || log.metadata?.skillId);
  if (routeEvent) {
    if (routeEvent.type === "info" && routeEvent.delta) return routeEvent.delta;
    if (routeEvent.metadata?.skillId) {
      if (routeEvent.metadata.skillId === "general_chat") return "General Assistant";
      return routeEvent.metadata.skillId;
    }
  }
  return "General Assistant";
}

function getModelName(logs: LogEvent[]) {
  const compEvent = logs.findLast((log) => log.type === "completed" || log.metadata?.model);
  if (compEvent?.metadata?.model) {
    return String(compEvent.metadata.model);
  }
  return "Standard Model";
}

function getOutputTokens(logs: LogEvent[]) {
  const compEvent = logs.findLast((log) => log.type === "completed" || log.metadata?.outputTokens);
  if (compEvent?.metadata?.outputTokens) {
    return Math.round(Number(compEvent.metadata.outputTokens));
  }
  return "~";
}

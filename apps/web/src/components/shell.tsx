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
  Cpu,
  GitBranch,
  Play,
  Trash2,
  ChevronRight,
  Activity,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useLocation } from "react-router-dom";
import { drivePhases } from "@remorra/ui";
import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../lib/api";
import { useWorkspaceStore, type LogEvent } from "../lib/store";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";
import { motionTransition } from "../lib/motion";
import { Avatar, Badge, Button, Card } from "./ui";
import { buttonVariants } from "./ui/button";
import { EmptyState } from "./app-ui";
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
  role: "founder" | "team" | "supplier";
  viabilityScore: number | null;
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
  const [projectName, setProjectName] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
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
    refetchInterval: 5000,
  });
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId);
  const setActiveProjectId = useWorkspaceStore((state) => state.setActiveProjectId);
  const logs = useWorkspaceStore((state) => state.logs);
  const streamState = useWorkspaceStore((state) => state.streamState);
  const isLogsOpen = useWorkspaceStore((state) => state.isLogsOpen);
  const setLogsOpen = useWorkspaceStore((state) => state.setLogsOpen);
  const clearLogs = useWorkspaceStore((state) => state.clearLogs);

  const logsEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (isLogsOpen) {
      setTimeout(() => {
        logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 50);
    }
  }, [logs.length, isLogsOpen]);

  const consent = useMutation({
    mutationFn: () =>
      api("/auth/consent", {
        method: "POST",
        body: JSON.stringify({ privacyPolicyVersion: "2026-06-15", termsVersion: "2026-06-15" }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
  const createProject = useMutation({
    mutationFn: () => api<Project>("/projects", { method: "POST", body: JSON.stringify({ name: projectName }) }),
    onSuccess: (created) => {
      setActiveProjectId(created.id);
      setProjectName("");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const project = projects.find((item) => item.id === activeProjectId) ?? projects[0];
  useEffect(() => {
    if (project && project.id !== activeProjectId) setActiveProjectId(project.id);
  }, [activeProjectId, project, setActiveProjectId]);

  const navItems = useMemo(() => {
    const items = project?.role === "supplier"
      ? [
          { to: "/venture", label: "My tasks", icon: ListChecks },
          { to: "/reports", label: "Build Pack", icon: FileChartColumn },
        ]
      : [
          { to: "/", label: "Overview", icon: LayoutDashboard },
          { to: "/workspace", label: "AI product guide", icon: MessageSquareText },
          { to: "/initiate", label: "Initiate", icon: Gauge },
          { to: "/venture", label: "Delivery", icon: ListChecks },
          { to: "/reports", label: "Reports & packs", icon: FileChartColumn },
          { to: "/team", label: "People & access", icon: Users },
          { to: "/knowledge", label: "Product library", icon: BookOpen },
        ];
    if (actor && ["admin", "support"].includes(actor.platformRole ?? "")) {
      items.push({ to: "/admin", label: "Platform admin", icon: ShieldCheck });
    }
    return items;
  }, [actor, project?.role]);

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

          {project && project.role !== "supplier" ? (
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
            {project?.viabilityScore != null ? (
              <div className="hidden h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs text-muted-foreground shadow-xs sm:flex">
                <Gauge size={14} className="text-primary" />
                <span>Viability</span>
                <strong className="text-foreground">{project.viabilityScore}</strong>
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

        <Sheet open={isLogsOpen} onOpenChange={setLogsOpen}>
          <SheetContent className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col h-full bg-zinc-950 text-zinc-50 border-l border-zinc-800 shadow-2xl">
            <SheetHeader className="border-b border-zinc-800 p-4 flex flex-row items-center justify-between gap-4">
              <div className="flex flex-col gap-1">
                <SheetTitle className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <Terminal className="size-4 text-primary animate-pulse" />
                  Backend Execution Logs
                </SheetTitle>
                <SheetDescription className="text-xs text-zinc-400">
                  Real-time activity of routing, skills, and model calls
                </SheetDescription>
              </div>
              <div className="flex items-center gap-2 pr-6">
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
              </div>
            </SheetHeader>

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

                    return (
                      <LogItem
                        key={`${log.sequence}-${index}`}
                        log={log}
                        time={time}
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
          </SheetContent>
        </Sheet>

        {!project ? (
          <div className="page-container">
            <EmptyState
              title="Create your first product workspace"
              description={createProject.error?.message ?? projectsError?.message ?? "Name the product or venture. Remorra will begin in Discover."}
              action={
                <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
                  <input
                    className="h-10 min-w-0 flex-1 rounded-[10px] border border-input bg-card px-3 text-sm outline-none focus:ring-3 focus:ring-ring/15"
                    value={projectName}
                    onChange={(event) => setProjectName(event.target.value)}
                    placeholder="Product name"
                    aria-label="Product name"
                  />
                  <Button disabled={createProject.isPending || projectName.trim().length < 2} onClick={() => createProject.mutate()}>
                    {createProject.isPending ? "Creating..." : "Create project"}
                  </Button>
                </div>
              }
            />
          </div>
        ) : children}
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

function LogItem({
  log,
  time,
  isInfo,
  isSuccess,
  isError,
  stage
}: {
  log: LogEvent;
  time: string;
  isInfo: boolean;
  isSuccess: boolean;
  isError: boolean;
  stage?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyMetadata = () => {
    if (log.metadata) {
      void navigator.clipboard.writeText(JSON.stringify(log.metadata, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
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
          {time && <span className="text-[10px] text-zinc-505 font-mono">{time}</span>}
          {getBadge()}
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
          <div className="relative mt-2 rounded-lg bg-zinc-900 border border-zinc-800 p-3 max-h-48 overflow-y-auto no-scrollbar">
            <button
              onClick={copyMetadata}
              className="absolute top-2 right-2 p-1.5 bg-zinc-950/60 rounded-md border border-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
              title="Copy JSON payload"
            >
              {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
            </button>
            <pre className="text-[10px] text-zinc-400 whitespace-pre-wrap font-mono leading-normal">
              {JSON.stringify(log.metadata, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

function getActiveSkillName(logs: LogEvent[]) {
  const routeEvent = logs.find((log) => log.type === "info" || log.metadata?.stage === "routing" || log.metadata?.skillId);
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
  const compEvent = logs.find((log) => log.type === "completed" || log.metadata?.model);
  if (compEvent?.metadata?.model) {
    return String(compEvent.metadata.model);
  }
  return "Standard Model";
}

function getOutputTokens(logs: LogEvent[]) {
  const compEvent = logs.find((log) => log.type === "completed" || log.metadata?.outputTokens);
  if (compEvent?.metadata?.outputTokens) {
    return Math.round(Number(compEvent.metadata.outputTokens));
  }
  return "~";
}

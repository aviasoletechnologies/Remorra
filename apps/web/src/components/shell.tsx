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
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useLocation } from "react-router-dom";
import { drivePhases } from "@remorra/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";
import { motionTransition } from "../lib/motion";
import { Avatar, Badge, Button } from "./ui";
import { buttonVariants } from "./ui/button";
import { EmptyState } from "./app-ui";
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
      <main className="configuration-page">
        <div className="brand-mark">R</div>
        <Badge tone="green">Privacy choices</Badge>
        <h1 className="text-2xl font-bold tracking-tight">Confirm how Remorra handles your data</h1>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          Remorra stores product conversations, generated documents, and usage evidence to provide the DRIVE workflow.
          You can export or schedule deletion from Privacy & data.
        </p>
        <Button disabled={consent.isPending} onClick={() => consent.mutate()}>
          {consent.isPending ? "Recording..." : "Accept terms and continue"}
        </Button>
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

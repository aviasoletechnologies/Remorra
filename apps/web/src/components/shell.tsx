import {
  Bell,
  BookOpen,
  ChevronDown,
  CircleHelp,
  FileChartColumn,
  Gauge,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation } from "react-router-dom";
import { drivePhases } from "@remorra/ui";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { supabase } from "../lib/supabase";
import { Avatar, Badge, Button, Card } from "./ui";
import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Project {
  id: string;
  name: string;
  phase: string;
  role: "founder" | "team" | "supplier";
  viabilityScore: number | null;
}

export function Shell({ children }: { children: ReactNode }) {
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
    refetchInterval: (query) => query.state.data ? false : 3000,
  });
  const { data: actor } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<any>("/auth/me"),
    retry: true,
    retryDelay: 1500,
    refetchInterval: (query) => query.state.data ? false : 3000,
  });
  const { data: jobs = [] } = useQuery({
    queryKey: ["recent-jobs"],
    queryFn: () => api<any[]>("/jobs"),
    refetchInterval: 5000,
  });
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId);
  const setActiveProjectId = useWorkspaceStore((state) => state.setActiveProjectId);
  const consent = useMutation({
    mutationFn: () =>
      api("/auth/consent", {
        method: "POST",
        body: JSON.stringify({
          privacyPolicyVersion: "2026-06-15",
          termsVersion: "2026-06-15",
        }),
      }),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
  const createProject = useMutation({
    mutationFn: () =>
      api<Project>("/projects", {
        method: "POST",
        body: JSON.stringify({ name: projectName }),
      }),
    onSuccess: (created) => {
      setActiveProjectId(created.id);
      setProjectName("");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const project =
    projects.find((item) => item.id === activeProjectId) ?? projects[0];
  useEffect(() => {
    if (project && project.id !== activeProjectId) setActiveProjectId(project.id);
  }, [activeProjectId, project, setActiveProjectId]);

  const navItems = project?.role === "supplier"
    ? [{ to: "/venture", label: "My tasks", icon: ListChecks }, { to: "/reports", label: "Build Pack", icon: FileChartColumn }]
    : [
        { to: "/", label: "Overview", icon: LayoutDashboard },
        { to: "/workspace", label: "AI product guide", icon: MessageSquareText },
        { to: "/initiate", label: "Initiate", icon: Gauge },
        { to: "/venture", label: "Delivery", icon: ListChecks },
        { to: "/reports", label: "Reports & packs", icon: FileChartColumn },
        { to: "/team", label: "People & access", icon: Users },
        { to: "/knowledge", label: "Product library", icon: BookOpen },
      ];
  if (actor && ["admin", "support"].includes(actor.platformRole)) {
    navItems.push({ to: "/admin", label: "Platform admin", icon: ShieldCheck });
  }

  if (
    location.pathname.startsWith("/invitations/") ||
    location.pathname === "/reset-password"
  ) {
    return children;
  }
  if (actor && (!actor.privacyPolicyVersion || !actor.termsVersion)) {
    return (
      <main className="configuration-page">
        <div className="brand-mark">R</div>
        <h1>Confirm your privacy choices</h1>
        <p>
          Remorra stores product conversations, generated documents, and usage
          evidence to provide the DRIVE workflow. You can export or schedule
          deletion from Privacy & data.
        </p>
        <Button disabled={consent.isPending} onClick={() => consent.mutate()}>
          {consent.isPending ? "Recording..." : "Accept terms and continue"}
        </Button>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">R</div>
          <div>
            <strong className="brand-title">remorra</strong>
            <span className="brand-subtitle">Product intelligence</span>
          </div>
        </div>
        <label className="project-switcher group">
          <span className="project-monogram">{project?.name.slice(0, 1) ?? "R"}</span>
          <span>
            <strong className="truncate max-w-[150px]">{project?.name ?? "Create your first project"}</strong>
            <small>{project?.role ?? "Founder workspace"}</small>
          </span>
          <select
            className="project-switcher-select"
            aria-label="Active project"
            value={project?.id ?? ""}
            onChange={(event) => setActiveProjectId(event.target.value)}
          >
            {projects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <ChevronDown size={15} className="text-muted group-hover:text-white transition-colors" />
        </label>
        
        <nav className="primary-nav" aria-label="Workspace navigation">
          <span className="nav-label">Workspace</span>
          <div className="grid gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `primary-nav-link relative group overflow-hidden ${isActive ? "primary-nav-link-active text-white" : "text-[#aeb9b2]"}`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.div
                        layoutId="active-nav-indicator"
                        className="absolute inset-0 bg-[#293a31] rounded-lg -z-10"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <motion.span
                      className="flex items-center gap-3 relative z-10 w-full"
                      whileHover={{ x: 2 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Icon size={18} className="opacity-80 group-hover:opacity-100 transition-opacity" />
                      <span className="font-medium">{label}</span>
                    </motion.span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>

        {project && project.role !== "supplier" && (
          <div className="drive-card">
            <div className="drive-card-heading">
              <span>DRIVE progress</span>
              <Badge tone="green">{project.phase}</Badge>
            </div>
            <div className="drive-rail">
              {drivePhases.map((phase) => {
                const current = drivePhases.findIndex((item) => item.id === project.phase);
                const index = drivePhases.findIndex((item) => item.id === phase.id);
                const isComplete = index <= current;
                const isCurrent = index === current;
                
                return (
                  <div className="drive-step" key={phase.id}>
                    <motion.span
                      className={`drive-step-circle ${isComplete ? "drive-step-complete" : ""} ${isCurrent ? "drive-step-current" : ""}`}
                      whileHover={{ scale: 1.1 }}
                    >
                      {phase.short}
                    </motion.span>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] leading-relaxed text-[#85948b] mt-2">
              Product context and delivery evidence stay connected across every phase.
            </p>
          </div>
        )}

        <div className="sidebar-bottom">
          <NavLink
            to="/privacy"
            className={({ isActive }) =>
              `primary-nav-link relative group ${isActive ? "primary-nav-link-active text-white" : "text-[#aeb9b2]"}`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="active-nav-indicator"
                    className="absolute inset-0 bg-[#293a31] rounded-lg -z-10"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
                <ShieldCheck size={18} className="opacity-80 group-hover:opacity-100 relative z-10" />
                <span className="font-medium relative z-10">Privacy & data</span>
              </>
            )}
          </NavLink>
          <button className="sidebar-signout" onClick={() => setSupportOpen((value) => !value)}>
            <CircleHelp size={18} className="opacity-80" />
            <span className="font-medium">Support</span>
          </button>
          <button className="sidebar-signout" onClick={() => void supabase?.auth.signOut()}>
            <Settings size={18} className="opacity-80" />
            <span className="font-medium">Sign out</span>
          </button>
          <div className="user-chip">
            <Avatar initials="AP" />
            <span>
              <strong>Account</strong>
              <small>{project?.role ?? "member"}</small>
            </span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="h-[64px] px-8 border-b border-border-remorra/60 bg-surface/90 backdrop-blur-md flex items-center justify-between sticky top-0 z-40">
          <div className="flex items-center gap-3 text-sm text-muted font-medium">
            <span>{project?.name ?? "Remorra"}</span>
            <span className="text-border-remorra">/</span>
            <strong className="text-ink tracking-wide uppercase text-xs">{project?.phase ?? "Workspace"}</strong>
          </div>
          <div className="flex items-center gap-4">
            {project?.viabilityScore != null && (
              <div className="h-9 px-3 flex items-center gap-2 border border-border-remorra bg-white rounded-lg text-muted shadow-sm">
                <Gauge size={15} className="text-accent" />
                <span className="font-bold uppercase tracking-wider text-[10px]">Viability</span>
                <strong className="text-accent text-sm font-bold">{project.viabilityScore}</strong>
              </div>
            )}
            <button
              className="w-9 h-9 rounded-lg border border-transparent hover:bg-surface-2 hover:border-border-remorra flex items-center justify-center text-muted transition-all relative"
              aria-label="Notifications"
              onClick={() => setNotificationsOpen((value) => !value)}
            >
              <Bell size={18} />
              {jobs.some((job) => ["queued", "running", "failed"].includes(job.status)) ? (
                <span className="absolute top-2 right-2 w-2 h-2 bg-red border-2 border-surface rounded-full" />
              ) : null}
            </button>
            {project?.role === "founder" && (
              <NavLink to="/workspace">
                <Button className="h-9 px-4 text-xs font-semibold shadow-sm shadow-accent/20 flex items-center gap-2">
                  <Sparkles size={14} />
                  <span>Open AI guide</span>
                </Button>
              </NavLink>
            )}
          </div>
        </header>

        <AnimatePresence>
          {notificationsOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed top-[74px] right-8 w-[340px] bg-surface border border-border-remorra/80 shadow-2xl rounded-xl p-5 z-50 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-ink">Recent activity</h2>
                <button onClick={() => setNotificationsOpen(false)} className="text-muted hover:text-ink text-xs font-medium">Close</button>
              </div>
              <div className="flex flex-col gap-2 mt-2">
                {jobs.length ? (
                  jobs.map((job) => (
                    <div className="flex items-center justify-between p-3 rounded-lg bg-surface-2 border border-border-remorra/40" key={job.id}>
                      <span className="text-xs font-medium text-ink">{job.queue}</span>
                      <Badge tone={job.status === "completed" ? "green" : job.status === "failed" ? "red" : "amber"}>
                        {job.status}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted py-4 text-center">No recent jobs in the last minute.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {supportOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="fixed bottom-8 left-[280px] w-[320px] bg-surface border border-border-remorra/80 shadow-2xl shadow-ink/10 rounded-xl p-6 z-50 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-2"><CircleHelp size={15} className="text-accent"/> Support</h2>
                <button onClick={() => setSupportOpen(false)} className="text-muted hover:text-ink text-xs font-medium">Close</button>
              </div>
              <p className="text-xs text-muted leading-relaxed">
                Share your project name, role, and the screen where the issue happened. Include the latest failed job
                ID if one is visible in notifications.
              </p>
              <a className="mt-3" href="mailto:support@remorra.local">
                <Button variant="secondary" className="w-full text-xs h-9">
                  Email support
                </Button>
              </a>
            </motion.div>
          )}
        </AnimatePresence>

        {!project ? (
          <EmptyWorkspace
            name={projectName}
            busy={createProject.isPending}
            error={createProject.error?.message ?? projectsError?.message}
            onName={setProjectName}
            onCreate={() => createProject.mutate()}
          />
        ) : (
          children
        )}
      </main>
    </div>
  );
}

function EmptyWorkspace({
  name,
  busy,
  error,
  onName,
  onCreate,
}: {
  name: string;
  busy: boolean;
  error: string | undefined;
  onName: (value: string) => void;
  onCreate: () => void;
}) {
  return (
    <div className="page-container placeholder-page">
      <Card className="max-w-[420px] p-9 text-center">
        <h1 className="text-xl font-bold font-sans tracking-tight mb-2">Create your first product workspace</h1>
        <p className="text-xs text-muted mb-4 leading-relaxed">
          Name the product or venture. Remorra will begin in Discover.
        </p>
        {error ? <p className="form-message mb-3">{error}</p> : null}
        <input
          className="workspace-name-input w-full h-[42px] border border-border-remorra rounded-lg bg-white px-3 mb-4 text-sm focus:outline-none focus:ring-2 focus:ring-accent/20"
          value={name}
          onChange={(event) => onName(event.target.value)}
          placeholder="Product name"
        />
        <Button className="w-full" disabled={busy || name.trim().length < 2} onClick={onCreate}>
          {busy ? "Creating..." : "Create project"}
        </Button>
      </Card>
    </div>
  );
}

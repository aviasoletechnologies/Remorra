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
import { Avatar, Badge, Button } from "./ui";
import { useEffect, useState, type ReactNode } from "react";

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
  });
  const { data: actor } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<any>("/auth/me"),
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
        <div className="brand"><div className="brand-mark">R</div><div><strong>remorra</strong><span>Product intelligence</span></div></div>
        <label className="project-switcher">
          <span className="project-monogram">{project?.name.slice(0, 1) ?? "R"}</span>
          <span><strong>{project?.name ?? "Create your first project"}</strong><small>{project?.role ?? "Founder workspace"}</small></span>
          <select aria-label="Active project" value={project?.id ?? ""} onChange={(event) => setActiveProjectId(event.target.value)}>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <ChevronDown size={15} />
        </label>
        <nav className="primary-nav" aria-label="Workspace navigation">
          <span className="nav-label">Workspace</span>
          {navItems.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === "/"}><Icon size={18} /><span>{label}</span></NavLink>)}
        </nav>
        {project && project.role !== "supplier" && <div className="drive-card">
          <div className="drive-card__heading"><span>DRIVE progress</span><Badge tone="green">{project.phase}</Badge></div>
          <div className="drive-rail">{drivePhases.map((phase) => {
            const current = drivePhases.findIndex((item) => item.id === project.phase);
            const index = drivePhases.findIndex((item) => item.id === phase.id);
            return <div className={`drive-step ${index <= current ? "is-complete" : ""} ${index === current ? "is-current" : ""}`} key={phase.id}><span>{phase.short}</span></div>;
          })}</div>
          <p>Product context and delivery evidence stay connected across every phase.</p>
        </div>}
        <div className="sidebar-bottom">
          <NavLink to="/privacy"><ShieldCheck size={18} />Privacy & data</NavLink>
          <button className="sidebar-signout" onClick={() => setSupportOpen((value) => !value)}><CircleHelp size={18} />Support</button>
          <button className="sidebar-signout" onClick={() => void supabase?.auth.signOut()}><Settings size={18} />Sign out</button>
          <div className="user-chip"><Avatar initials="AP" /><span><strong>Account</strong><small>{project?.role ?? "member"}</small></span></div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="topbar__trail"><span>{project?.name ?? "Remorra"}</span><span>/</span><strong>{project?.phase ?? "Workspace"}</strong></div>
          <div className="topbar__actions">
            {project?.viabilityScore != null && <div className="score-chip"><Gauge size={17} /><span>Viability</span><strong>{project.viabilityScore}</strong></div>}
            <button className="icon-button" aria-label="Notifications" onClick={() => setNotificationsOpen((value) => !value)}><Bell size={18} />{jobs.some((job) => ["queued", "running", "failed"].includes(job.status)) ? <span className="notification-dot" /> : null}</button>
            {project?.role === "founder" && <NavLink to="/workspace" className="button button--primary"><Sparkles size={16} />Open AI guide</NavLink>}
          </div>
        </header>
        {notificationsOpen ? <div className="floating-panel notification-panel"><h2>Recent activity</h2>{jobs.length ? jobs.map((job) => <div className="panel-row" key={job.id}><span>{job.queue}</span><Badge tone={job.status === "completed" ? "green" : job.status === "failed" ? "red" : "amber"}>{job.status}</Badge></div>) : <p>No recent jobs in the last minute.</p>}</div> : null}
        {supportOpen ? <div className="floating-panel support-panel"><h2>Support</h2><p>Share your project name, role, and the screen where the issue happened. Include the latest failed job ID if one is visible in notifications.</p><a className="button button--secondary" href="mailto:support@remorra.local">Email support</a></div> : null}
        {!project ? (
          <EmptyWorkspace
            name={projectName}
            busy={createProject.isPending}
            error={createProject.error?.message ?? projectsError?.message}
            onName={setProjectName}
            onCreate={() => createProject.mutate()}
          />
        ) : children}
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
  return <div className="page placeholder-page"><div className="card"><h1>Create your first product workspace</h1><p>Name the product or venture. Remorra will begin in Discover.</p>{error ? <p className="form-message">{error}</p> : null}<input className="workspace-name-input" value={name} onChange={(event) => onName(event.target.value)} placeholder="Product name" /><Button disabled={busy || name.trim().length < 2} onClick={onCreate}>{busy ? "Creating..." : "Create project"}</Button></div></div>;
}

import React from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceStore } from "../lib/store";
import { api } from "../lib/api";
import type { Project } from "@remorra/contracts";

const PHASE_HOME: Record<string, string> = {
  discover: "/workspace",
  refine: "/workspace",
  initiate: "/initiate",
  venture: "/venture",
  evolve: "/venture",
};

export function PhaseRoute({
  allowedPhases,
  children,
}: {
  allowedPhases: string[];
  children: React.ReactNode;
}) {
  const activeProjectId = useWorkspaceStore((state) => state.activeProjectId);

  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/projects"),
    enabled: Boolean(activeProjectId),
  });

  if (!activeProjectId) {
    return <Navigate to="/workspace" replace />;
  }

  if (!projects) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground animate-pulse">Loading workspace phase...</p>
      </div>
    );
  }

  const project = projects.find((p) => p.id === activeProjectId);
  if (!project) {
    return <Navigate to="/workspace" replace />;
  }

  if (!allowedPhases.includes(project.phase)) {
    const redirect = PHASE_HOME[project.phase] ?? "/workspace";
    return <Navigate to={redirect} replace />;
  }

  return <>{children}</>;
}

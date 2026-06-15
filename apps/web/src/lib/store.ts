import { create } from "zustand";

interface WorkspaceState {
  activeProjectId: string | null;
  setActiveProjectId(id: string): void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeProjectId: localStorage.getItem("remorra.activeProject"),
  setActiveProjectId(id) {
    localStorage.setItem("remorra.activeProject", id);
    set({ activeProjectId: id });
  },
}));

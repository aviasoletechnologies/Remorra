import { create } from "zustand";

export interface LogEvent {
  sequence: number;
  type: string;
  delta?: string | null;
  snapshot?: string | null;
  metadata?: any;
  createdAt?: string;
}

interface WorkspaceState {
  activeProjectId: string | null;
  setActiveProjectId(id: string): void;
  logs: LogEvent[];
  streamState: "idle" | "connecting" | "reconnecting" | "connected";
  setStreamState(state: "idle" | "connecting" | "reconnecting" | "connected"): void;
  addLog(log: LogEvent): void;
  clearLogs(): void;
  isLogsOpen: boolean;
  setLogsOpen(open: boolean): void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeProjectId: localStorage.getItem("remorra.activeProject"),
  setActiveProjectId(id) {
    localStorage.setItem("remorra.activeProject", id);
    set({ activeProjectId: id });
  },
  logs: [],
  streamState: "idle",
  setStreamState(state) {
    set({ streamState: state });
  },
  addLog(log) {
    set((state) => ({ logs: [...state.logs, log] }));
  },
  clearLogs() {
    set({ logs: [] });
  },
  isLogsOpen: false,
  setLogsOpen(open) {
    set({ isLogsOpen: open });
  },
}));

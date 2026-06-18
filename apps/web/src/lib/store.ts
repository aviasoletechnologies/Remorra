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
  setLogs(logs: LogEvent[]): void;
  streamState: "idle" | "connecting" | "reconnecting" | "connected";
  setStreamState(state: "idle" | "connecting" | "reconnecting" | "connected"): void;
  addLog(log: LogEvent): void;
  clearLogs(): void;
  isLogsOpen: boolean;
  setLogsOpen(open: boolean): void;
}

const loadInitialLogs = (): LogEvent[] => {
  try {
    const data = localStorage.getItem("remorra.logs");
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  activeProjectId: localStorage.getItem("remorra.activeProject"),
  setActiveProjectId(id) {
    localStorage.setItem("remorra.activeProject", id);
    set({ activeProjectId: id });
  },
  logs: loadInitialLogs(),
  setLogs(logs) {
    try {
      localStorage.setItem("remorra.logs", JSON.stringify(logs));
    } catch (err) {
      console.warn("Failed to save logs to localStorage", err);
    }
    set({ logs });
  },
  streamState: "idle",
  setStreamState(state) {
    set({ streamState: state });
  },
  addLog(log) {
    set((state) => {
      const updated = [...state.logs, log];
      try {
        localStorage.setItem("remorra.logs", JSON.stringify(updated));
      } catch (err) {
        console.warn("Failed to save logs to localStorage", err);
      }
      return { logs: updated };
    });
  },
  clearLogs() {
    try {
      localStorage.removeItem("remorra.logs");
    } catch {}
    set({ logs: [] });
  },
  isLogsOpen: false,
  setLogsOpen(open) {
    set({ isLogsOpen: open });
  },
}));

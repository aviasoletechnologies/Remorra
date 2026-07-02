import { Page } from "../components/app-ui";
import { useWorkspaceStore } from "../lib/store";
import { EvolvePanel } from "../components/evolve-panel";

export function EvolvePage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  if (!projectId) return null;

  return (
    <Page className="h-[calc(100vh-64px)] !p-0 flex overflow-hidden">
      <div className="flex-1 flex flex-col min-h-0 min-w-0 p-4 md:p-6">
        <div className="flex-1 flex flex-col min-h-0 rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <EvolvePanel projectId={projectId} />
        </div>
      </div>
    </Page>
  );
}

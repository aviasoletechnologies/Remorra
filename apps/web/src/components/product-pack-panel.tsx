import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProductPackDto } from "@remorra/contracts";
import { api } from "../lib/api";
import { CheckCircle2 } from "lucide-react";

interface ProductPackPanelProps {
  projectId: string;
  externalPack?: ProductPackDto | null;
}

export function ProductPackPanel({ projectId, externalPack }: ProductPackPanelProps) {
  const queryClient = useQueryClient();

  const { data: pack, isLoading } = useQuery({
    queryKey: ["product-pack", projectId],
    queryFn: () => api<ProductPackDto>(`/projects/${projectId}/product-pack`),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (externalPack) {
      queryClient.setQueryData(["product-pack", projectId], externalPack);
    }
  }, [externalPack, projectId, queryClient]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-xs text-muted-foreground animate-pulse">Loading Product Pack...</p>
      </div>
    );
  }

  const isEmpty = !pack || (pack.ambitions.length === 0 && pack.personas.length === 0);

  return (
    <div className="h-full overflow-y-auto flex flex-col gap-4 py-4 px-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product Pack</h2>
        {pack?.passThread && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            <CheckCircle2 size={11} />
            Ready
          </span>
        )}
      </div>

      {/* Coverage bar */}
      {pack && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Coverage</span>
            <span className="text-xs font-medium">{pack.coveragePercent}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-500"
              style={{ width: `${pack.coveragePercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-xs text-muted-foreground text-center leading-relaxed px-4">
            Start a conversation to build your Product Pack
          </p>
        </div>
      )}

      {/* Ambitions */}
      {pack && pack.ambitions.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ambitions</p>
          {pack.ambitions.map((ambition) => (
            <div key={ambition.id} className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">{ambition.title}</p>
              {ambition.detail && (
                <p className="text-xs text-muted-foreground leading-relaxed">{ambition.detail}</p>
              )}
              {ambition.okrs.length > 0 && (
                <div className="pl-3 border-l-2 border-muted mt-1 flex flex-col gap-1">
                  {ambition.okrs.map((okr) => (
                    <p key={okr.id} className="text-xs text-muted-foreground">{okr.objective}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Personas */}
      {pack && pack.personas.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personas</p>
          {pack.personas.map((persona) => (
            <div key={persona.id} className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">{persona.name}</p>
              {persona.description && (
                <p className="text-xs text-muted-foreground leading-relaxed">{persona.description}</p>
              )}
              {persona.painPoints.length > 0 && (
                <div className="pl-3 border-l-2 border-muted mt-1">
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">Pain points</p>
                  {persona.painPoints.map((pt) => (
                    <p key={pt.id} className="text-xs text-muted-foreground">• {pt.statement}</p>
                  ))}
                </div>
              )}
              {persona.userNeeds.length > 0 && (
                <div className="pl-3 border-l-2 border-muted mt-1">
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">User needs</p>
                  {persona.userNeeds.map((n) => (
                    <p key={n.id} className="text-xs text-muted-foreground">• {n.statement}</p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

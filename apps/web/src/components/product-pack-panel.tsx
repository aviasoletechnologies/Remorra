import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProductPackDto } from "@remorra/contracts";
import { api } from "../lib/api";
import { 
  CheckCircle2, 
  Target, 
  TrendingUp, 
  Users, 
  AlertCircle, 
  Sparkles, 
  HelpCircle, 
  MessageSquare,
  ChevronRight,
  ShieldCheck
} from "lucide-react";

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
      <div className="h-full flex flex-col items-center justify-center gap-3 py-12">
        <div className="relative w-10 h-10">
          <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 border-t-emerald-500 animate-spin" />
        </div>
        <p className="text-xs text-muted-foreground font-medium animate-pulse">Assembling Product Pack...</p>
      </div>
    );
  }

  const isEmpty = !pack || (pack.ambitions.length === 0 && pack.personas.length === 0);

  return (
    <div className="h-full flex flex-col bg-background/50 backdrop-blur-md border-l border-border/60">
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/40 bg-card/20">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-emerald-500/10 text-emerald-500">
            <Target size={14} className="animate-pulse" />
          </div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Product Pack</h2>
        </div>
        {pack?.passThread && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/10 shadow-sm animate-bounce">
            <ShieldCheck size={11} />
            Ready
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-5 p-4">
        {/* Coverage Progress Card */}
        {pack && (
          <div className="relative overflow-hidden rounded-xl border border-border/80 bg-gradient-to-br from-card to-secondary/10 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sync Coverage</span>
              <span className="text-sm font-bold text-foreground font-mono">{pack.coveragePercent}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700 ease-out"
                style={{ width: `${pack.coveragePercent}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
              Calculates structural alignment across Ambitions, OKRs, and Personas.
            </p>
          </div>
        )}

        {/* Empty State */}
        {isEmpty && (
          <div className="flex-grow flex flex-col items-center justify-center text-center p-6 my-8 border border-dashed border-border/60 rounded-xl bg-card/20">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3 text-muted-foreground/60">
              <MessageSquare size={20} />
            </div>
            <h3 className="text-xs font-semibold text-foreground mb-1">Build Your Product Pack</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed max-w-[200px]">
              Start talking to the AI guide to define your ambitions, OKRs, and target personas.
            </p>
          </div>
        )}

        {/* Ambitions Section */}
        {pack && pack.ambitions.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Target size={11} />
              <span>Ambitions & OKRs</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {pack.ambitions.map((ambition) => (
                <div 
                  key={ambition.id} 
                  className="group flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-200 hover:border-border hover:shadow-md"
                >
                  <div>
                    <h4 className="text-xs font-bold text-foreground leading-snug group-hover:text-emerald-500 transition-colors">
                      {ambition.title}
                    </h4>
                    {ambition.detail && (
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                        {ambition.detail}
                      </p>
                    )}
                  </div>

                  {ambition.okrs.length > 0 && (
                    <div className="flex flex-col gap-1.5 border-t border-border/40 pt-2.5 mt-0.5">
                      <div className="flex items-center gap-1 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                        <TrendingUp size={9} />
                        <span>Key Results</span>
                      </div>
                      <div className="flex flex-col gap-1 pl-1">
                        {ambition.okrs.map((okr) => (
                          <div key={okr.id} className="flex gap-2 items-start text-xs text-foreground/80">
                            <ChevronRight size={12} className="text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                            <span className="text-[11px] leading-relaxed">{okr.objective}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Personas Section */}
        {pack && pack.personas.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <Users size={11} />
              <span>Target Personas</span>
            </div>
            <div className="flex flex-col gap-2.5">
              {pack.personas.map((persona) => (
                <div 
                  key={persona.id} 
                  className="group flex flex-col gap-2.5 rounded-xl border border-border/60 bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.02)] transition-all duration-200 hover:border-border hover:shadow-md"
                >
                  <div>
                    <h4 className="text-xs font-bold text-foreground leading-snug group-hover:text-emerald-500 transition-colors">
                      {persona.name}
                    </h4>
                    {persona.description && (
                      <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                        {persona.description}
                      </p>
                    )}
                  </div>

                  {/* Pain Points */}
                  {persona.painPoints.length > 0 && (
                    <div className="flex flex-col gap-1.5 border-t border-border/40 pt-2.5 mt-0.5">
                      <div className="flex items-center gap-1 text-[9px] font-bold text-amber-600/90 dark:text-amber-400/90 uppercase tracking-wider">
                        <AlertCircle size={9} />
                        <span>Fristrations & Pain Points</span>
                      </div>
                      <div className="flex flex-col gap-1 pl-1">
                        {persona.painPoints.map((pt) => (
                          <div key={pt.id} className="flex gap-1.5 items-start text-xs bg-amber-500/5 hover:bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/10 transition-colors">
                            <span className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-300">
                              {pt.statement}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* User Needs */}
                  {persona.userNeeds.length > 0 && (
                    <div className="flex flex-col gap-1.5 border-t border-border/40 pt-2.5 mt-0.5">
                      <div className="flex items-center gap-1 text-[9px] font-bold text-sky-600/90 dark:text-sky-400/90 uppercase tracking-wider">
                        <Sparkles size={9} />
                        <span>Required Capabilities</span>
                      </div>
                      <div className="flex flex-col gap-1 pl-1">
                        {persona.userNeeds.map((n) => (
                          <div key={n.id} className="flex gap-1.5 items-start text-xs bg-sky-500/5 hover:bg-sky-500/10 p-1.5 rounded-lg border border-sky-500/10 transition-colors">
                            <span className="text-[11px] leading-relaxed text-sky-700 dark:text-sky-300">
                              {n.statement}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

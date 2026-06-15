import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCircle2, CircleAlert, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useWorkspaceStore } from "../lib/store";
import { Badge, Button, Card, Progress } from "../components/ui";
import { motion } from "framer-motion";

export function OverviewPage() {
  const projectId = useWorkspaceStore((state) => state.activeProjectId);
  const { data, isLoading } = useQuery({
    queryKey: ["venture", projectId],
    queryFn: () => api<any>(`/projects/${projectId}/venture`),
    enabled: Boolean(projectId),
  });
  const { data: viability } = useQuery({
    queryKey: ["viability", projectId],
    queryFn: () => api<any>(`/viability/projects/${projectId}/current`),
    enabled: Boolean(projectId),
  });

  if (isLoading) {
    return (
      <div className="min-height-[50vh] grid place-items-center text-muted text-sm font-medium animate-pulse">
        Loading product evidence…
      </div>
    );
  }

  const tasks = data?.tasks ?? [];
  const done = tasks.filter((task: any) => task.status === "done").length;
  const blockers = data?.raid?.filter((item: any) => item.status !== "closed") ?? [];
  const completion = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  const score = viability?.overall ?? 0;

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } },
  } as const;

  return (
    <div className="page-container py-8 px-6 max-w-[1440px] mx-auto flex flex-col gap-6">
      <section className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <Badge tone="green">Live product workspace</Badge>
          <h1 className="text-3xl font-bold font-sans tracking-tight text-ink mt-3 mb-1">Your product intelligence</h1>
          <p className="text-sm text-muted">Focus on the evidence, decisions, and delivery movement that matter now.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/reports">
            <Button variant="secondary">Generate report</Button>
          </Link>
          <Link to="/venture">
            <Button variant="primary" className="group">
              <span>Open delivery board</span>
              <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </Link>
        </div>
      </section>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 md:grid-cols-12 gap-5"
      >
        {/* Card 1: Viability */}
        <Card className="col-span-12 md:col-span-6 p-6 flex flex-col justify-between" variants={itemVariants}>
          <div>
            <div className="flex justify-between items-start text-xs text-muted font-semibold mb-4">
              <span>PRODUCT VIABILITY</span>
              <Badge tone="green">Evidence based</Badge>
            </div>
            
            <div className="flex items-center gap-6 my-4">
              <div
                className="w-[86px] h-[86px] rounded-full flex items-center justify-center relative flex-shrink-0"
                style={{
                  background: `conic-gradient(var(--color-accent) 0% ${score}%, #e4e8e2 ${score}% 100%)`,
                }}
              >
                <div className="absolute inset-[7px] bg-surface rounded-full flex flex-col items-center justify-center shadow-inner">
                  <strong className="text-2xl font-bold text-ink leading-none">{viability?.overall ?? "—"}</strong>
                  <span className="text-[9px] text-muted font-semibold mt-0.5">/100</span>
                </div>
              </div>
              
              <div>
                <h3 className="text-sm font-bold font-sans text-ink mb-1">
                  {viability?.rationale ? "Current assessment" : "Not calculated yet"}
                </h3>
                <p className="text-xs text-muted leading-relaxed max-w-[320px]">
                  {viability?.rationale ?? "Complete Discover and Refine to create the first score."}
                </p>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-3 border-t border-border-remorra/50 pt-4 mt-2">
            {Object.entries(viability?.components ?? {}).slice(0, 3).map(([label, val]) => (
              <div key={label} className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center text-[9px] text-muted font-semibold">
                  <span className="truncate max-w-[70px] uppercase tracking-wide">{label.replace("_", " ")}</span>
                  <b className="text-ink">{String(val)}</b>
                </div>
                <Progress value={Number(val)} label={`${label} score`} />
              </div>
            ))}
          </div>
        </Card>

        {/* Card 2: Cycle Health */}
        <Card className="col-span-12 md:col-span-3 p-6 flex flex-col justify-between" variants={itemVariants}>
          <div>
            <div className="text-xs text-muted font-semibold mb-2">CYCLE HEALTH</div>
            <div className="text-4xl font-bold font-sans tracking-tight text-ink mt-2 mb-1">
              {completion}<span className="text-base text-muted font-medium ml-0.5">%</span>
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
              {done} of {tasks.length} tasks completed
            </p>
          </div>
          
          <div className="my-4">
            <Progress value={completion} label="Cycle completion" />
          </div>
          
          <div className="flex items-center justify-between border-t border-border-remorra/50 pt-3 text-[10px] text-muted font-medium">
            <span className="flex items-center gap-1.5 text-accent">
              <CheckCircle2 size={14} />
              <span>{done} done</span>
            </span>
            <span>{tasks.length - done} open</span>
          </div>
        </Card>

        {/* Card 3: Attention Panel */}
        <Card className="col-span-12 md:col-span-3 p-6 bg-[#fffcf5] border-[#eadbc2] flex flex-col justify-between" variants={itemVariants}>
          <div>
            <div className="flex justify-between items-start text-xs text-muted font-semibold mb-2">
              <span>NEEDS ATTENTION</span>
              <Badge tone="amber">{blockers.length} items</Badge>
            </div>
            <div className="text-4xl font-bold font-sans text-amber mt-2 mb-1">{blockers.length}</div>
            <h3 className="text-xs font-bold font-sans text-ink mb-1">Open risks and dependencies</h3>
            <p className="text-[11px] text-muted leading-relaxed">
              Use Evolve when a delivery issue changes strategy or linked product intent.
            </p>
          </div>
          
          <div className="border-t border-[#eadbc2]/50 pt-3 mt-4">
            <Link to="/evolve" className="flex items-center gap-1 text-[11px] font-bold text-amber hover:text-amber/80 transition-colors">
              <span>Work through it in Evolve</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </Card>

        {/* Card 4: Insight Banner */}
        <Card className="col-span-12 p-5 bg-[#edf4ee] border-[#cfdfd2] flex flex-col md:flex-row gap-4 items-center justify-between shadow-none" variants={itemVariants}>
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-accent text-white shadow-sm flex-shrink-0">
              <Sparkles size={20} />
            </div>
            <div>
              <span className="text-[9px] font-bold text-accent tracking-wider uppercase block">Remorra intelligence</span>
              <h3 className="text-xs font-bold text-ink mt-1 mb-0.5 leading-snug">
                {viability?.actions?.[0]?.title ?? "Build evidence before expanding scope."}
              </h3>
              <p className="text-[10px] text-muted max-w-[640px]">
                Every recommendation is grounded in confirmed records and remains subject to founder approval.
              </p>
            </div>
          </div>
          <Button variant="secondary" className="flex items-center gap-1.5 flex-shrink-0 w-full md:w-auto mt-2 md:mt-0 justify-center">
            <CircleAlert size={14} />
            <span>Review actions</span>
          </Button>
        </Card>
      </motion.div>
    </div>
  );
}

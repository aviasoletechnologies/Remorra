import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BrainCircuit,
  Database,
  ShieldCheck,
  TrendingUp,
  Users,
  DollarSign,
  FileText,
  AlertTriangle,
  RefreshCw,
  Eye,
  Settings,
  ShieldAlert,
  BookOpen,
  Clock,
} from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card } from "../components/ui";
import { api } from "../lib/api";
import { AdminFlowBuilder } from "../components/admin-flow-builder";
import { Page, PageHeader } from "../components/app-ui";

export function AdminPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "support" | "templates" | "costs" | "system" | "users">("overview");
  const [userPage, setUserPage] = useState(1);
  const USER_PAGE_SIZE = 10;

  // System drafts (Legacy states kept for compatibility)
  const [skillDrafts, setSkillDrafts] = useState<Record<string, string>>({});
  const [knowledgeDrafts, setKnowledgeDrafts] = useState<Record<string, string>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<string, string>>({});

  const [systemSubTab, setSystemSubTab] = useState<"skills" | "flows" | "routing" | "reports" | "knowledge" | "retention">("skills");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);

  // Skill Creation States
  const [isCreateSkillOpen, setIsCreateSkillOpen] = useState(false);
  const [newSkillId, setNewSkillId] = useState("");
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [newSkillPrompt, setNewSkillPrompt] = useState("");
  const [skillCreateError, setSkillCreateError] = useState<string | null>(null);

  // Skill Editing States
  const [editingSkill, setEditingSkill] = useState<any | null>(null);
  const [editPromptText, setEditPromptText] = useState("");

  // Event Routing States
  const [newEventRoutingType, setNewEventRoutingType] = useState("");
  const [newEventRoutingSkillId, setNewEventRoutingSkillId] = useState("");

  // Period Selector State
  type PeriodPreset = "today" | "week" | "mtd" | "ytd" | "all";
  const [period, setPeriod] = useState<PeriodPreset>("all");
  const periodDates = (() => {
    const now = new Date();
    switch (period) {
      case "today": return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString() };
      case "week": { const d = new Date(now); d.setDate(d.getDate() - 7); return { from: d.toISOString() }; }
      case "mtd": return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
      case "ytd": return { from: new Date(now.getFullYear(), 0, 1).toISOString() };
      default: return {};
    }
  })();
  const periodQuery = Object.entries(periodDates).map(([k, v]) => `${k}=${v}`).join("&");

  // Tab 1: Overview & Metrics Queries
  const { data: actor } = useQuery<any>({ queryKey: ["me"], queryFn: () => api("/auth/me") });
  const { data: overviewMetrics } = useQuery<any>({
    queryKey: ["admin-overview-metrics", period],
    queryFn: () => api(`/admin/metrics/overview${periodQuery ? `?${periodQuery}` : ""}`),
    enabled: activeTab === "overview",
  });
  const { data: usageMetrics } = useQuery<any>({
    queryKey: ["admin-usage-metrics", period],
    queryFn: () => api(`/admin/metrics/usage${periodQuery ? `?${periodQuery}` : ""}`),
    enabled: activeTab === "overview",
  });
  const { data: jobsMetrics } = useQuery<any>({
    queryKey: ["admin-jobs-metrics", period],
    queryFn: () => api(`/admin/metrics/jobs${periodQuery ? `?${periodQuery}` : ""}`),
    enabled: activeTab === "overview",
    refetchInterval: 5000,
  });

  // Tab 2: Support Projects List
  const { data: supportProjects = [] } = useQuery<any[]>({
    queryKey: ["admin-support-projects"],
    queryFn: () => api("/admin/support/projects"),
    enabled: activeTab === "support",
  });

  const [selectedSupportProjectId, setSelectedSupportProjectId] = useState<string | null>(null);
  const { data: supportProjectDetails, isFetching: loadingSupportDetails } = useQuery<any>({
    queryKey: ["admin-support-project-details", selectedSupportProjectId],
    queryFn: () => api(`/admin/support/projects/${selectedSupportProjectId}`),
    enabled: activeTab === "support" && !!selectedSupportProjectId,
  });

  // Tab 3: Template Manager Queries
  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ["admin-templates"],
    queryFn: () => api("/admin/templates"),
    enabled: activeTab === "templates",
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Template editor states
  const [templateHtml, setTemplateHtml] = useState("");
  const [templateCss, setTemplateCss] = useState("");
  const [templateSchemaText, setTemplateSchemaText] = useState("");
  const [sampleJsonText, setSampleJsonText] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const selectTemplate = (template: any) => {
    setSelectedTemplateId(template.id);
    setTemplateHtml(template.versions[0]?.html ?? "");
    setTemplateCss(template.versions[0]?.css ?? "");
    setTemplateSchemaText(JSON.stringify(template.versions[0]?.schema ?? {}, null, 2));
    setPreviewHtml(null);
    setValidationError(null);

    // Initial mock data templates
    if (template.id === "founder-pack") {
      setSampleJsonText(JSON.stringify({
        projectName: "Greenfield Analytics",
        summary: "An automated greenhouse carbon tracking workspace.",
        vision: "Pioneering decentralized agronomy carbon tracking.",
        targetAudience: "B2B Agronomists and compliance officers.",
        keyFeatures: ["Carbon calculation", "Real-time PDF extraction", "Stripe payment mapping"],
        revenueModel: "Flat subscription $50/project-month."
      }, null, 2));
    } else if (template.id === "product-pack") {
      setSampleJsonText(JSON.stringify({
        projectName: "Greenfield Analytics",
        coveragePercent: 88,
        linkageValid: true,
        ambitions: [{ id: "amb-1", title: "Carbon Neutrality", detail: "Reduce workspace operational carbon output by 20%." }],
        personas: [{ id: "per-1", name: "Auditor Alice", description: "Agronomy carbon checker.", userNeeds: [{ id: "un-1", statement: "Needs clean linkage reports" }], painPoints: [{ id: "pp-1", statement: "Stale data reports lead to audit delays." }] }]
      }, null, 2));
    } else {
      setSampleJsonText(JSON.stringify({
        projectName: "Greenfield Analytics",
        viabilityScore: 78,
        viabilityRationale: "Healthy delivery linkage and clear customer pain statement.",
        productCoveragePercent: 88,
        deliveryLinkageValid: true,
        activeSprintCompletedTasks: 6,
        activeSprintTotalTasks: 8,
        totalBudgetSpentMinor: 12000,
        totalBudgetAllocatedMinor: 25000,
        risksCount: 4,
        criticalRisksCount: 0
      }, null, 2));
    }
  };

  // Tab 4: Cost Config Queries
  const { data: costConfigs = [] } = useQuery<any[]>({
    queryKey: ["admin-cost-configs"],
    queryFn: () => api("/admin/cost-configs"),
    enabled: activeTab === "costs",
  });
  const [costDrafts, setCostDrafts] = useState<Record<string, { name: string; inputCostMinor: number; outputCostMinor: number; flatCostMinor: number; active: boolean }>>({});

  // System tab queries
  const [skillPage, setSkillPage] = useState(1);
  const SKILL_PAGE_SIZE = 10;

  const { data: skillsData } = useQuery<any>({
    queryKey: ["admin-skills", skillPage],
    queryFn: () => api(`/admin/skills?page=${skillPage}&limit=${SKILL_PAGE_SIZE}`),
    enabled: activeTab === "system",
  });
  const skills = skillsData?.items ?? [];
  const totalSkillPages = skillsData?.totalPages ?? 1;

  const { data: allSkillsData } = useQuery<any>({
    queryKey: ["admin-all-skills-list"],
    queryFn: () => api("/admin/skills?limit=100"),
    enabled: activeTab === "system",
  });
  const allSkills = allSkillsData?.items ?? [];

  const { data: mappings = [] } = useQuery<any[]>({ queryKey: ["admin-skill-mappings"], queryFn: () => api("/admin/skill-mappings"), enabled: activeTab === "system" });
  const { data: retention = [] } = useQuery<any[]>({ queryKey: ["admin-retention"], queryFn: () => api("/admin/retention"), enabled: activeTab === "system" });
  const { data: usersData } = useQuery<any>({
    queryKey: ["admin-users", userPage],
    queryFn: () => api(`/admin/users?page=${userPage}&limit=${USER_PAGE_SIZE}`),
    enabled: activeTab === "users",
  });
  const users = usersData?.items ?? [];
  const totalPages = usersData?.totalPages ?? 1;
  const { data: reports = [] } = useQuery<any[]>({ queryKey: ["admin-reports"], queryFn: () => api("/admin/reports"), enabled: activeTab === "system" });
  const { data: knowledge = [] } = useQuery<any[]>({ queryKey: ["admin-knowledge"], queryFn: () => api("/admin/knowledge-bases"), enabled: activeTab === "system" });

  const isAdmin = actor?.platformRole === "admin";

  // Mutations
  const createTemplateVersion = useMutation({
    mutationFn: ({ id, html, css, schema }: { id: string; html: string; css: string; schema: any }) =>
      api(`/admin/templates/${id}/versions`, {
        method: "POST",
        body: JSON.stringify({ html, css, schema }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-templates"] });
      alert("Successfully created new template version!");
    },
  });

  const previewTemplate = useMutation({
    mutationFn: ({ id, html, css, schema, sampleData }: { id: string; html: string; css: string; schema: any; sampleData: any }) =>
      api(`/admin/templates/${id}/preview`, {
        method: "POST",
        body: JSON.stringify({ html, css, schema, sampleData }),
      }),
    onSuccess: (res: any) => {
      setPreviewHtml(res.html);
      setValidationError(null);
    },
    onError: (err: any) => {
      setValidationError(err.message || "Template rendering preview failed.");
    },
  });

  const activateTemplateVersion = useMutation({
    mutationFn: ({ id, versionId }: { id: string; versionId: string }) =>
      api(`/admin/templates/${id}/versions/${versionId}/activate`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-templates"] });
      alert("Template version activated transactionally!");
    },
  });

  const updateCostConfig = useMutation({
    mutationFn: ({ key, data }: { key: string; data: any }) =>
      api(`/admin/cost-configs/${key}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-cost-configs"] });
      alert("Cost configuration updated successfully!");
    },
  });

  const setMapping = useMutation({
    mutationFn: ({ eventType, skillId }: { eventType: string; skillId: string }) =>
      api(`/admin/skill-mappings/${encodeURIComponent(eventType)}`, { method: "PUT", body: JSON.stringify({ skillId }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-skill-mappings"] }),
  });
  const activate = useMutation({
    mutationFn: ({ skillId, versionId }: { skillId: string; versionId: string }) =>
      api(`/admin/skills/${skillId}/versions/${versionId}/activate`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-skills"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-all-skills-list"] });
    },
  });
  const createSkillVersion = useMutation({
    mutationFn: ({ skillId, systemPrompt }: { skillId: string; systemPrompt: string }) =>
      api(`/admin/skills/${skillId}/versions`, { method: "POST", body: JSON.stringify({ systemPrompt }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-skills"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-all-skills-list"] });
    },
  });
  const createSkillMutation = useMutation({
    mutationFn: (data: { id: string; name: string; description: string; systemPrompt: string }) =>
      api("/admin/skills", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-skills"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-all-skills-list"] });
      setIsCreateSkillOpen(false);
      setNewSkillId("");
      setNewSkillName("");
      setNewSkillDesc("");
      setNewSkillPrompt("");
      setSkillCreateError(null);
      alert("Skill created successfully!");
    },
    onError: (err: any) => {
      setSkillCreateError(err.message || "Failed to create skill.");
    }
  });
  const createKnowledgeVersion = useMutation({
    mutationFn: ({ id, markdown }: { id: string; markdown: string }) =>
      api(`/admin/knowledge-bases/${id}/versions`, { method: "POST", body: JSON.stringify({ markdown, activate: true }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-knowledge"] }),
  });
  const createReportVersion = useMutation({
    mutationFn: ({ id, templateKey }: { id: string; templateKey: string }) =>
      api(`/admin/reports/${id}/versions`, { method: "POST", body: JSON.stringify({ templateKey, activate: true }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-reports"] }),
  });
  const retryJob = useMutation({
    mutationFn: (id: string) => api(`/admin/jobs/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-jobs-metrics"] });
    },
  });
  const updateRetention = useMutation({
    mutationFn: ({ id, retentionDays }: { id: string; retentionDays: number }) =>
      api(`/admin/retention/${id}`, { method: "PATCH", body: JSON.stringify({ retentionDays }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-retention"] }),
  });
  const updateRole = useMutation({
    mutationFn: ({ id, platformRole }: { id: string; platformRole: string }) =>
      api(`/admin/users/${id}/platform-role`, { method: "PATCH", body: JSON.stringify({ platformRole }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  return (
    <Page>
      <PageHeader eyebrow="Internal administration" tone="neutral" title="Platform operations console" description="Durable templates, automated cost rates, routing, usage, and redaction-enforced support diagnostics." />

      {/* Tabs Menu */}
      <div className="admin-tabbar">
        <button data-active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
          <TrendingUp size={16} /> Overview Metrics
        </button>
        <button data-active={activeTab === "support"} onClick={() => setActiveTab("support")}>
          <Users size={16} /> Support Workspace
        </button>
        <button data-active={activeTab === "templates"} onClick={() => setActiveTab("templates")}>
          <FileText size={16} /> Document Templates
        </button>
        <button data-active={activeTab === "costs"} onClick={() => setActiveTab("costs")}>
          <DollarSign size={16} /> Costs Manager
        </button>
        <button data-active={activeTab === "system"} onClick={() => setActiveTab("system")}>
          <Settings size={16} /> System Routing
        </button>
        <button data-active={activeTab === "users"} onClick={() => setActiveTab("users")}>
          <Users size={16} /> Platform Users
        </button>
      </div>

      {/* Tab Content 1: Overview */}
      {activeTab === "overview" && (
        <>
          <div className="period-tabs mb-4">
            {(["today", "week", "mtd", "ytd", "all"] as const).map((p) => (
              <button
                key={p}
                data-active={period === p}
                onClick={() => setPeriod(p)}
              >
                {p === "mtd" ? "MTD" : p === "ytd" ? "YTD" : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5 flex flex-col gap-2 bg-card shadow-sm border-border">
              <div className="w-8 h-8 rounded bg-blue-soft/30 flex items-center justify-center text-blue"><Users size={16} /></div>
              <span className="text-xs font-bold text-muted uppercase tracking-wide">Total Users</span>
              <strong className="text-2xl font-bold text-ink">{overviewMetrics?.users ?? "-"}</strong>
            </Card>
            <Card className="p-5 flex flex-col gap-2 bg-card shadow-sm border-border">
              <div className="w-8 h-8 rounded bg-green-soft/30 flex items-center justify-center text-green"><Database size={16} /></div>
              <span className="text-xs font-bold text-muted uppercase tracking-wide">Projects (Active)</span>
              <strong className="text-2xl font-bold text-ink">
                {overviewMetrics?.projects ?? "-"} ({overviewMetrics?.activeProjects ?? "-"})
              </strong>
            </Card>
            <Card className="p-5 flex flex-col gap-2 bg-card shadow-sm border-border">
              <div className="w-8 h-8 rounded bg-destructive/10 flex items-center justify-center text-destructive"><ShieldCheck size={16} /></div>
              <span className="text-xs font-bold text-muted uppercase tracking-wide">Failed Jobs (30d)</span>
              <strong className="text-2xl font-bold text-ink">{overviewMetrics?.failedJobs ?? "-"}</strong>
            </Card>
            <Card className="p-5 flex flex-col gap-2 bg-card shadow-sm border-border">
              <div className="w-8 h-8 rounded bg-amber-soft/30 flex items-center justify-center text-amber"><BrainCircuit size={16} /></div>
              <span className="text-xs font-bold text-muted uppercase tracking-wide">Tokens Cost / Revenue</span>
              <strong className="text-2xl font-bold text-ink">
                ${(((overviewMetrics?.totalCost ?? 0)) / 100).toFixed(2)}
              </strong>
              <small className="text-[10px] text-muted">
                Margin Estimate: {overviewMetrics?.margin ?? 100}%
              </small>
            </Card>
          </section>

          <div className="grid grid-cols-1 gap-6">
            <Card className="p-6 bg-card shadow-sm border-border overflow-x-auto">
              <h2 className="text-base font-bold text-ink mb-4">Token Usage Breakdown</h2>
              <table className="w-full text-left text-sm border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 font-semibold text-muted">Model Tier / Key</th>
                    <th className="pb-2 font-semibold text-muted">Input Tokens</th>
                    <th className="pb-2 font-semibold text-muted">Output Tokens</th>
                    <th className="pb-2 font-semibold text-muted">Estimated Cost (USD)</th>
                    <th className="pb-2 font-semibold text-muted">Invocations count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(usageMetrics?.byModel ?? []).map((m: any) => (
                    <tr key={m.model}>
                      <td className="py-3 font-semibold text-ink">{m.model}</td>
                      <td className="py-3 text-muted">{m._sum.inputTokens}</td>
                      <td className="py-3 text-muted">{m._sum.outputTokens}</td>
                      <td className="py-3 text-muted">${((m._sum.costMinor ?? 0) / 100).toFixed(4)}</td>
                      <td className="py-3 text-muted">{m._count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="p-6 bg-card shadow-sm border-border overflow-x-auto">
              <h2 className="text-base font-bold text-ink mb-4">Recent Failed Jobs Queue & Diagnostics</h2>
              <table className="w-full text-left text-sm border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pb-2 font-semibold text-muted">Job ID</th>
                    <th className="pb-2 font-semibold text-muted">Queue</th>
                    <th className="pb-2 font-semibold text-muted">Failure Reason</th>
                    <th className="pb-2 font-semibold text-muted">Attempts</th>
                    <th className="pb-2 font-semibold text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(jobsMetrics?.recentFailed ?? []).map((j: any) => (
                    <tr key={j.id}>
                      <td><small>{j.id.slice(0, 8)}</small></td>
                      <td><strong>{j.queue}</strong></td>
                      <td style={{ color: "var(--color-destructive)" }}>{j.error}</td>
                      <td>{j.attempts}</td>
                      <td>
                        <Button variant="secondary" onClick={() => retryJob.mutate(j.id)}>
                          Retry
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {(jobsMetrics?.recentFailed ?? []).length === 0 && (
                    <tr>
                      <td colSpan={5} style={{ textAlign: "center", color: "#849289" }}>
                        No failed jobs requiring diagnostics.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}

      {/* Tab Content 2: Support Projects */}
      {activeTab === "support" && (
        <div className="admin-grid" style={{ gridTemplateColumns: selectedSupportProjectId ? "1fr 1.5fr" : "1fr" }}>
          <Card className="admin-table">
            <h2>Support Projects Workspace</h2>
            <table className="admin-wide-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Owner</th>
                  <th>Health</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {supportProjects.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      {p.isSupportRisk && <Badge tone="red">At Risk</Badge>}
                    </td>
                    <td><small>{p.ownerEmail}</small></td>
                    <td>
                      {p.latestViabilityScore !== null ? (
                        <Badge tone={p.latestViabilityScore >= 70 ? "green" : p.latestViabilityScore >= 50 ? "amber" : "red"}>
                          {p.latestViabilityScore}
                        </Badge>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <Button variant="secondary" onClick={() => setSelectedSupportProjectId(p.id)}>
                        Inspect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {selectedSupportProjectId && (
            <Card className="admin-table">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2>Diagnostic Console: {supportProjectDetails?.name ?? "Loading..."}</h2>
                <Button variant="ghost" onClick={() => setSelectedSupportProjectId(null)}>
                  Close
                </Button>
              </div>

              {loadingSupportDetails ? (
                <p>Loading project details...</p>
              ) : (
                <>
                  <div className="support-detail-grid">
                    <div>
                      <h3>General Info</h3>
                      <p>Project ID: <strong>{supportProjectDetails?.id}</strong></p>
                      <p>Owner: <strong>{supportProjectDetails?.ownerEmail}</strong></p>
                      <p>Usage Spike (7d vs prev 7d):{" "}
                        <strong style={{ color: (supportProjectDetails?.usageSpikePercent ?? 0) > 50 ? "var(--color-destructive)" : "inherit" }}>
                          {supportProjectDetails?.usageSpikePercent ?? 0}%
                        </strong>
                      </p>
                    </div>
                    <div>
                      <h3>Team Membership Roles</h3>
                      <ul>
                        {(supportProjectDetails?.members ?? []).map((m: any) => (
                          <li key={m.userId}>
                            {m.name || m.email} - <Badge tone="blue">{m.role}</Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <h3 style={{ marginTop: "20px" }}>Redacted Diagnostic Audit Log</h3>
                  <table className="admin-wide-table">
                    <thead>
                      <tr>
                        <th>Event Type</th>
                        <th>Entity</th>
                        <th>Created At</th>
                        <th>Metadata (Encrypted)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(supportProjectDetails?.recentAudits ?? []).map((a: any) => (
                        <tr key={a.id}>
                          <td><strong>{a.eventType}</strong></td>
                          <td>{a.entityType || "-"}</td>
                          <td><small>{new Date(a.createdAt).toLocaleString()}</small></td>
                          <td style={{ color: "#849289" }}>{a.metadata}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <h3 style={{ marginTop: "20px" }}>Redacted Project Jobs (Last 30)</h3>
                  <table className="admin-wide-table">
                    <thead>
                      <tr>
                        <th>Queue</th>
                        <th>Status</th>
                        <th>Attempts</th>
                        <th>Payload / Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(supportProjectDetails?.recentJobs ?? []).map((j: any) => (
                        <tr key={j.id}>
                          <td><strong>{j.queue}</strong></td>
                          <td>
                            <Badge tone={j.status === "completed" ? "green" : j.status === "failed" ? "red" : "amber"}>
                              {j.status}
                            </Badge>
                          </td>
                          <td>{j.attempts}</td>
                          <td style={{ color: "#849289" }}>{j.payload} / {j.result}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Tab Content 3: Templates Manager */}
      {activeTab === "templates" && (
        <div className="admin-template-grid">
          <Card className="admin-table admin-list-card">
            <h2>Select Template</h2>
            {templates.map((t) => (
              <div key={t.id} className={`admin-list-item ${selectedTemplateId === t.id ? "active" : ""}`} onClick={() => selectTemplate(t)}>
                <strong>{t.name}</strong>
                <small>{t.id} ({t.type})</small>
              </div>
            ))}
          </Card>

          {selectedTemplateId && selectedTemplate ? (
            <Card className="admin-table">
              <h2>Template Editor: {selectedTemplate.name}</h2>
              <p style={{ color: "#849289", fontSize: "11px", marginBottom: "14px" }}>
                Type: <strong>{selectedTemplate.type}</strong>
              </p>

              {!isAdmin && (
                <div className="admin-danger-note">
                  <ShieldAlert />
                  <p>
                    Support mode is read-only. Cost rates and rendering templates can only be mutated by a Platform Admin.
                  </p>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <h3>HTML Layout Template</h3>
                  <textarea className="admin-textarea" value={templateHtml} onChange={(e) => setTemplateHtml(e.target.value)} disabled={!isAdmin} />
                </div>
                <div>
                  <h3>CSS Styling Template</h3>
                  <textarea className="admin-textarea" value={templateCss} onChange={(e) => setTemplateCss(e.target.value)} disabled={!isAdmin} />
                </div>
                <div>
                  <h3>Validation Contract (JSON Schema)</h3>
                  <textarea className="admin-textarea" value={templateSchemaText} onChange={(e) => setTemplateSchemaText(e.target.value)} disabled={!isAdmin} />
                </div>
                <div>
                  <h3>Sample Payload (Testing)</h3>
                  <textarea className="admin-textarea" value={sampleJsonText} onChange={(e) => setSampleJsonText(e.target.value)} />
                </div>
              </div>

              {validationError && (
                <p className="error-text" style={{ margin: "10px 0" }}>
                  <AlertTriangle size={14} /> {validationError}
                </p>
              )}

              <div className="inline-actions" style={{ marginTop: "14px" }}>
                <Button variant="secondary" onClick={() => {
                  try {
                    const parsedData = JSON.parse(sampleJsonText);
                    const parsedSchema = templateSchemaText ? JSON.parse(templateSchemaText) : null;
                    previewTemplate.mutate({
                      id: selectedTemplate.id,
                      html: templateHtml,
                      css: templateCss,
                      schema: parsedSchema,
                      sampleData: parsedData
                    });
                  } catch (e: any) {
                    setValidationError("Invalid JSON in sample data or schema: " + e.message);
                  }
                }}>
                  Test & Render HTML
                </Button>

                {isAdmin && (
                  <Button onClick={() => {
                    try {
                      const parsedSchema = templateSchemaText ? JSON.parse(templateSchemaText) : null;
                      createTemplateVersion.mutate({
                        id: selectedTemplate.id,
                        html: templateHtml,
                        css: templateCss,
                        schema: parsedSchema
                      });
                    } catch (e: any) {
                      setValidationError("Invalid JSON in schema: " + e.message);
                    }
                  }}>
                    Create Version
                  </Button>
                )}
              </div>

              {previewHtml && (
                <div style={{ marginTop: "20px" }}>
                  <h3>Live Report Render Preview</h3>
                  <div className="admin-preview-box" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                </div>
              )}

              <h3 style={{ marginTop: "24px" }}>Available Versions</h3>
              <table className="admin-wide-table">
                <thead>
                  <tr>
                    <th>Version</th>
                    <th>Created At</th>
                    <th>State</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedTemplate.versions.map((v: any) => (
                    <tr key={v.id}>
                      <td><strong>v{v.version}</strong></td>
                      <td><small>{new Date(v.createdAt).toLocaleString()}</small></td>
                      <td>
                        <Badge tone={v.active ? "green" : "neutral"}>
                          {v.active ? "active" : "inactive"}
                        </Badge>
                      </td>
                      <td>
                        {!v.active && isAdmin && (
                          <Button variant="secondary" onClick={() => activateTemplateVersion.mutate({ id: selectedTemplate.id, versionId: v.id })}>
                            Activate version
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <Card className="admin-table">
              <p style={{ textAlign: "center", color: "#849289" }}>Select a template from the left list to edit/preview.</p>
            </Card>
          )}
        </div>
      )}

      {/* Tab Content 4: Costs Manager */}
      {activeTab === "costs" && (
        <Card className="admin-table">
          <h2>Costs & Pricing Configurations</h2>
          <p style={{ color: "#849289", fontSize: "11px", marginBottom: "14px" }}>
            Admins can adjust platform unit billing costs. Unit types determine token usage metric weights.
          </p>

          {!isAdmin && (
            <div className="admin-danger-note">
              <ShieldAlert />
              <p>
                Support mode is read-only. Cost rates and rendering templates can only be mutated by a Platform Admin.
              </p>
            </div>
          )}

          <table className="admin-wide-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Name</th>
                <th>Unit Type</th>
                <th>Currency</th>
                <th>Input Cost (scaled)</th>
                <th>Output Cost (scaled)</th>
                <th>Flat Cost (minor)</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {costConfigs.map((c: any) => {
                const draft = costDrafts[c.key] || {
                  name: c.name,
                  inputCostMinor: c.inputCostMinor,
                  outputCostMinor: c.outputCostMinor,
                  flatCostMinor: c.flatCostMinor,
                  active: c.active
                };

                return (
                  <tr key={c.key}>
                    <td><small>{c.key}</small></td>
                    <td>
                      <input aria-label={`Name for ${c.key}`} style={{ width: "140px" }} value={draft.name} onChange={(e) => setCostDrafts({ ...costDrafts, [c.key]: { ...draft, name: e.target.value } })} disabled={!isAdmin} />
                    </td>
                    <td><Badge tone="blue">{c.unit}</Badge></td>
                    <td>{c.currency}</td>
                    <td>
                      {c.unit === "per_1m_tokens" ? (
                        <input aria-label={`Input cost for ${c.key}`} type="number" style={{ width: "80px" }} value={draft.inputCostMinor} onChange={(e) => setCostDrafts({ ...costDrafts, [c.key]: { ...draft, inputCostMinor: Number(e.target.value) } })} disabled={!isAdmin} />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      {c.unit === "per_1m_tokens" ? (
                        <input aria-label={`Output cost for ${c.key}`} type="number" style={{ width: "80px" }} value={draft.outputCostMinor} onChange={(e) => setCostDrafts({ ...costDrafts, [c.key]: { ...draft, outputCostMinor: Number(e.target.value) } })} disabled={!isAdmin} />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      {c.unit !== "per_1m_tokens" ? (
                        <input aria-label={`Flat cost for ${c.key}`} type="number" style={{ width: "80px" }} value={draft.flatCostMinor} onChange={(e) => setCostDrafts({ ...costDrafts, [c.key]: { ...draft, flatCostMinor: Number(e.target.value) } })} disabled={!isAdmin} />
                      ) : (
                        "-"
                      )}
                    </td>
                    <td>
                      <input aria-label={`Active state for ${c.key}`} type="checkbox" checked={draft.active} onChange={(e) => setCostDrafts({ ...costDrafts, [c.key]: { ...draft, active: e.target.checked } })} disabled={!isAdmin} />
                    </td>
                    <td>
                      {isAdmin && (
                        <Button variant="secondary" onClick={() => updateCostConfig.mutate({ key: c.key, data: draft })}>
                          Save
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {/* Tab Content 5: System Settings (Sub-nav Layout) */}
      {activeTab === "system" && (
        <div className="admin-sub-layout">
          <aside className="admin-sub-sidebar">
            <button
              className={`admin-sub-tab ${systemSubTab === "skills" ? "active" : ""}`}
              onClick={() => setSystemSubTab("skills")}
            >
              <BrainCircuit size={16} />
              <span>Skill Registry</span>
            </button>
            <button
              className={`admin-sub-tab ${systemSubTab === "flows" ? "active" : ""}`}
              onClick={() => setSystemSubTab("flows")}
            >
              <Activity size={16} />
              <span>Guided Flows</span>
            </button>
            <button
              className={`admin-sub-tab ${systemSubTab === "routing" ? "active" : ""}`}
              onClick={() => setSystemSubTab("routing")}
            >
              <Activity size={16} />
              <span>Event Routing</span>
            </button>
            <button
              className={`admin-sub-tab ${systemSubTab === "reports" ? "active" : ""}`}
              onClick={() => setSystemSubTab("reports")}
            >
              <FileText size={16} />
              <span>Report Definitions</span>
            </button>
            <button
              className={`admin-sub-tab ${systemSubTab === "knowledge" ? "active" : ""}`}
              onClick={() => setSystemSubTab("knowledge")}
            >
              <BookOpen size={16} />
              <span>Knowledge Bases</span>
            </button>
            <button
              className={`admin-sub-tab ${systemSubTab === "retention" ? "active" : ""}`}
              onClick={() => setSystemSubTab("retention")}
            >
              <Clock size={16} />
              <span>Retention Policies</span>
            </button>
          </aside>

          <div className="admin-sub-content">
            {systemSubTab === "flows" && <AdminFlowBuilder canWrite={isAdmin} />}
            {systemSubTab === "skills" && (
              <Card className="admin-table">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                  <div>
                    <h2>Skill Registry</h2>
                    <p className="section-description" style={{ margin: 0 }}>
                      Register agent skills, edit system prompt templates, and activate versions.
                    </p>
                  </div>
                  {isAdmin && (
                    <Button onClick={() => setIsCreateSkillOpen(true)}>
                      Create Skill
                    </Button>
                  )}
                </div>

                <table className="admin-wide-table">
                  <thead>
                    <tr>
                      <th>Skill ID</th>
                      <th>Name</th>
                      <th>Description</th>
                      <th>Active Version</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skills.map((skill: any) => {
                      const activeVer = skill.versions.find((v: any) => v.active);
                      return (
                        <tr key={skill.id}>
                          <td><code>{skill.id}</code></td>
                          <td><strong>{skill.name}</strong></td>
                          <td>{skill.description}</td>
                          <td>
                            {activeVer ? (
                              <Badge tone="green">v{activeVer.version}</Badge>
                            ) : (
                              <Badge tone="amber">Inactive</Badge>
                            )}
                          </td>
                          <td>
                            <Button
                              variant="secondary"
                              onClick={() => {
                                setEditingSkill(skill);
                                const currentVer = skill.versions.find((v: any) => v.active) ?? skill.versions[0];
                                setEditPromptText(currentVer?.systemPrompt ?? "");
                              }}
                            >
                              Edit Prompt
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {skills.length === 0 && (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", color: "#849289", padding: "20px 0" }}>
                          No skills found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="pagination-controls">
                  <Button
                    variant="secondary"
                    onClick={() => setSkillPage((prev) => Math.max(prev - 1, 1))}
                    disabled={skillPage <= 1}
                  >
                    Previous
                  </Button>
                  <span className="pagination-info">
                    Page {skillPage} of {totalSkillPages}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() => setSkillPage((prev) => Math.min(prev + 1, totalSkillPages))}
                    disabled={skillPage >= totalSkillPages}
                  >
                    Next
                  </Button>
                </div>
              </Card>
            )}

            {systemSubTab === "routing" && (
              <Card className="admin-table">
                <h2>Automatic Skill Routing</h2>
                <p className="section-description">
                  Route specific workspace events to the appropriate AI skill registry handler.
                </p>

                {isAdmin && (
                  <div className="add-routing-row">
                    <div style={{ flex: 1 }}>
                      <label className="admin-field-label">Event Type</label>
                      <input
                        type="text"
                        placeholder="e.g. project.analyze"
                        className="admin-input"
                        style={{ width: "100%" }}
                        value={newEventRoutingType}
                        onChange={(e) => setNewEventRoutingType(e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="admin-field-label">Skill Handler</label>
                      <select
                        value={newEventRoutingSkillId}
                        onChange={(e) => setNewEventRoutingSkillId(e.target.value)}
                        className="admin-select"
                        style={{ width: "100%", height: "35px" }}
                      >
                        <option value="">Select a skill...</option>
                        {allSkills.map((skill: any) => (
                          <option key={skill.id} value={skill.id}>
                            {skill.name} ({skill.id})
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      onClick={() => {
                        if (!newEventRoutingType || !newEventRoutingSkillId) {
                          alert("Both event type and skill handler are required.");
                          return;
                        }
                        setMapping.mutate({ eventType: newEventRoutingType, skillId: newEventRoutingSkillId });
                        setNewEventRoutingType("");
                        setNewEventRoutingSkillId("");
                      }}
                    >
                      Add Routing
                    </Button>
                  </div>
                )}

                <div className="routing-list">
                  {mappings.map((mapping) => (
                    <div className="routing-row" key={mapping.eventType}>
                      <div className="routing-info">
                        <strong>{mapping.eventType}</strong>
                        <span>Resolved dynamically on job execution</span>
                      </div>
                      <div className="routing-action">
                        <select
                          aria-label={`Skill for ${mapping.eventType}`}
                          value={mapping.skillId}
                          onChange={(event) =>
                            setMapping.mutate({ eventType: mapping.eventType, skillId: event.target.value })
                          }
                          disabled={!isAdmin}
                          className="admin-select"
                        >
                          {allSkills.map((skill: any) => (
                            <option key={skill.id} value={skill.id}>
                              {skill.name} ({skill.id})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {systemSubTab === "reports" && (
              <div className="admin-master-detail">
                <div className="admin-master-list">
                  <h3>Report Definitions</h3>
                  {reports.map((report) => {
                    const isActive = (selectedReportId || (reports[0] && reports[0].id)) === report.id;
                    const activeVer = report.versions.find((item: any) => item.active) ?? report.versions[0];
                    return (
                      <div
                        key={report.id}
                        className={`admin-list-item ${isActive ? "active" : ""}`}
                        onClick={() => setSelectedReportId(report.id)}
                      >
                        <strong>{report.name}</strong>
                        <div className="item-meta">
                          {activeVer?.requiresLlm ? <Badge tone="amber">LLM</Badge> : <Badge tone="blue">Deterministic</Badge>}
                          <span>v{activeVer?.version ?? "-"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="admin-detail-editor">
                  {(() => {
                    const activeReport = reports.find((r) => r.id === (selectedReportId || (reports[0] && reports[0].id)));
                    if (!activeReport) return <div className="placeholder-detail">Select a report to view and edit details</div>;

                    const activeVer = activeReport.versions.find((item: any) => item.active) ?? activeReport.versions[0];
                    const draft = reportDrafts[activeReport.id] ?? activeVer?.templateKey ?? "";

                    return (
                      <Card className="detail-card">
                        <div className="detail-header">
                          <div>
                            <h2>{activeReport.name}</h2>
                            <p className="subtitle">
                              {activeVer?.requiresLlm ? "Requires Large Language Model processing" : "Generates deterministically via engine"}
                            </p>
                          </div>
                          <Badge tone="green">v{activeVer?.version ?? "1"}</Badge>
                        </div>

                        <div className="editor-section">
                          <label>Associated Document Template Key</label>
                          <input
                            type="text"
                            className="admin-input"
                            value={draft}
                            onChange={(event) =>
                              setReportDrafts((current) => ({ ...current, [activeReport.id]: event.target.value }))
                            }
                            disabled={!isAdmin}
                          />
                          <span className="input-help">Links this report definition to a layout template of the same key.</span>
                        </div>

                        {isAdmin && (
                          <div className="detail-footer">
                            <Button
                              onClick={() => createReportVersion.mutate({ id: activeReport.id, templateKey: draft })}
                            >
                              Update Associated Template Key
                            </Button>
                          </div>
                        )}
                      </Card>
                    );
                  })()}
                </div>
              </div>
            )}

            {systemSubTab === "knowledge" && (
              <div className="admin-master-detail">
                <div className="admin-master-list">
                  <h3>Knowledge Bases</h3>
                  {knowledge.map((base) => {
                    const isActive = (selectedKbId || (knowledge[0] && knowledge[0].id)) === base.id;
                    const activeVer = base.versions.find((item: any) => item.active) ?? base.versions[0];
                    return (
                      <div
                        key={base.id}
                        className={`admin-list-item ${isActive ? "active" : ""}`}
                        onClick={() => setSelectedKbId(base.id)}
                      >
                        <strong>{base.name}</strong>
                        <div className="item-meta">
                          <span>{base.topic}</span>
                          {activeVer && <Badge tone="green">v{activeVer.version}</Badge>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="admin-detail-editor">
                  {(() => {
                    const activeKb = knowledge.find((k) => k.id === (selectedKbId || (knowledge[0] && knowledge[0].id)));
                    if (!activeKb) return <div className="placeholder-detail">Select a knowledge base to view and edit details</div>;

                    const activeVer = activeKb.versions.find((item: any) => item.active) ?? activeKb.versions[0];
                    const draft = knowledgeDrafts[activeKb.id] ?? activeVer?.markdown ?? "";

                    return (
                      <Card className="detail-card">
                        <div className="detail-header">
                          <div>
                            <h2>{activeKb.name}</h2>
                            <span className="topic-tag">{activeKb.topic}</span>
                          </div>
                          <Badge tone="green">v{activeVer?.version ?? "1"}</Badge>
                        </div>

                        <div className="editor-section">
                          <label>Knowledge Base Markdown Content</label>
                          <textarea
                            className="admin-textarea monospace"
                            value={draft}
                            onChange={(event) =>
                              setKnowledgeDrafts((current) => ({ ...current, [activeKb.id]: event.target.value }))
                            }
                            disabled={!isAdmin}
                          />
                        </div>

                        {isAdmin && (
                          <div className="detail-footer">
                            <Button
                              onClick={() => createKnowledgeVersion.mutate({ id: activeKb.id, markdown: draft })}
                            >
                              Publish & Activate Content Version
                            </Button>
                          </div>
                        )}
                      </Card>
                    );
                  })()}
                </div>
              </div>
            )}

            {systemSubTab === "retention" && (
              <Card className="admin-table">
                <h2>Retention Policies</h2>
                <p className="section-description">
                  Configure data retention and cleanup schedules for security and compliance requirements.
                </p>
                <div className="retention-list">
                  {retention.map((policy) => (
                    <div className="retention-row" key={policy.id}>
                      <div className="retention-info">
                        <strong>{policy.description}</strong>
                        <code>{policy.id}</code>
                      </div>
                      <div className="retention-action">
                        <input
                          aria-label={`Days for ${policy.id}`}
                          type="number"
                          value={policy.retentionDays ?? ""}
                          onChange={(event) =>
                            updateRetention.mutate({ id: policy.id, retentionDays: Number(event.target.value) })
                          }
                          disabled={!isAdmin}
                          className="admin-input-small"
                          placeholder="Forever"
                        />
                        <span className="input-suffix">days</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <Card className="admin-table">
          <h2>Platform Users</h2>
          <p className="section-description">
            Manage user accounts and assign administrative or support privileges.
          </p>
          <table className="admin-wide-table">
            <thead>
              <tr>
                <th>Preferred Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Platform Role</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user: any) => (
                <tr key={user.id}>
                  <td>
                    <strong>{user.preferredName || user.email.split("@")[0]}</strong>
                  </td>
                  <td>{user.email}</td>
                  <td>
                    <Badge tone={user.status === "active" ? "green" : "red"}>{user.status}</Badge>
                  </td>
                  <td>
                    <select
                      value={user.platformRole}
                      onChange={(event) =>
                        updateRole.mutate({ id: user.id, platformRole: event.target.value })
                      }
                      disabled={!isAdmin}
                      className="admin-select"
                    >
                      <option value="user">User</option>
                      <option value="support">Support</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: "center", color: "#849289", padding: "20px 0" }}>
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="pagination-controls">
            <Button
              variant="secondary"
              onClick={() => setUserPage((prev) => Math.max(prev - 1, 1))}
              disabled={userPage <= 1}
            >
              Previous
            </Button>
            <span className="pagination-info">
              Page {userPage} of {totalPages}
            </span>
            <Button
              variant="secondary"
              onClick={() => setUserPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={userPage >= totalPages}
            >
              Next
            </Button>
          </div>
        </Card>
      )}
      {/* Skill Edit Modal */}
      {editingSkill && (
        <div className="admin-modal-overlay">
          <Card className="admin-modal-content">
            <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #334139", paddingBottom: "12px" }}>
              <div>
                <h2 style={{ margin: 0 }}>Edit Skill Prompt: {editingSkill.name}</h2>
                <code style={{ background: "#111b16", padding: "2px 6px", borderRadius: "4px", fontSize: "11px" }}>{editingSkill.id}</code>
              </div>
              <Button variant="ghost" onClick={() => setEditingSkill(null)}>
                Close
              </Button>
            </div>

            <div className="modal-body" style={{ marginTop: "16px" }}>
              {(() => {
                const activeVer = editingSkill.versions.find((item: any) => item.active);
                const newest = editingSkill.versions[0];
                return (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px", alignItems: "center" }}>
                      <span>
                        Active Version: {activeVer ? <Badge tone="green">v{activeVer.version}</Badge> : <Badge tone="amber">None</Badge>}
                      </span>
                      {newest && newest.id !== activeVer?.id && (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            activate.mutate({ skillId: editingSkill.id, versionId: newest.id });
                            setEditingSkill(null);
                          }}
                          disabled={!isAdmin}
                        >
                          Activate v{newest.version}
                        </Button>
                      )}
                    </div>

                    <div className="editor-section">
                      <label style={{ display: "block", marginBottom: "6px", fontSize: "11px", color: "#849289" }}>System Prompt Template</label>
                      <textarea
                        className="admin-textarea monospace"
                        style={{ minHeight: "240px", background: "#111b16", color: "#eef6f0", border: "1px solid #405048" }}
                        value={editPromptText}
                        onChange={(e) => setEditPromptText(e.target.value)}
                        disabled={!isAdmin}
                      />
                    </div>

                    {isAdmin && (
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
                        <Button
                          onClick={() => {
                            createSkillVersion.mutate({ skillId: editingSkill.id, systemPrompt: editPromptText });
                            setEditingSkill(null);
                          }}
                        >
                          Create & Publish New Version
                        </Button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </Card>
        </div>
      )}

      {/* Skill Create Modal */}
      {isCreateSkillOpen && (
        <div className="admin-modal-overlay">
          <Card className="admin-modal-content">
            <div className="modal-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #334139", paddingBottom: "12px" }}>
              <h2 style={{ margin: 0 }}>Create New Agent Skill</h2>
              <Button variant="ghost" onClick={() => {
                setIsCreateSkillOpen(false);
                setSkillCreateError(null);
              }}>
                Close
              </Button>
            </div>

            <div className="modal-body" style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#849289", marginBottom: "4px" }}>Skill ID (unique slug)</label>
                <input
                  type="text"
                  placeholder="e.g. risk-evaluator"
                  className="admin-input"
                  style={{ width: "100%", background: "#111b16", color: "#eef6f0", border: "1px solid #405048", borderRadius: "8px", padding: "8px" }}
                  value={newSkillId}
                  onChange={(e) => setNewSkillId(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#849289", marginBottom: "4px" }}>Skill Name</label>
                <input
                  type="text"
                  placeholder="e.g. Risk Evaluator"
                  className="admin-input"
                  style={{ width: "100%", background: "#111b16", color: "#eef6f0", border: "1px solid #405048", borderRadius: "8px", padding: "8px" }}
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#849289", marginBottom: "4px" }}>Description</label>
                <input
                  type="text"
                  placeholder="e.g. Evaluates project delivery risks"
                  className="admin-input"
                  style={{ width: "100%", background: "#111b16", color: "#eef6f0", border: "1px solid #405048", borderRadius: "8px", padding: "8px" }}
                  value={newSkillDesc}
                  onChange={(e) => setNewSkillDesc(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#849289", marginBottom: "4px" }}>Initial System Prompt</label>
                <textarea
                  placeholder="You are an expert agent that..."
                  className="admin-textarea monospace"
                  style={{ minHeight: "150px", background: "#111b16", color: "#eef6f0", border: "1px solid #405048" }}
                  value={newSkillPrompt}
                  onChange={(e) => setNewSkillPrompt(e.target.value)}
                />
              </div>

              {skillCreateError && (
                <p style={{ color: "var(--color-destructive)", fontSize: "11px", margin: 0 }}>{skillCreateError}</p>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "8px" }}>
                <Button
                  onClick={() => {
                    if (!newSkillId || !newSkillName || !newSkillDesc || !newSkillPrompt) {
                      setSkillCreateError("All fields are required.");
                      return;
                    }
                    createSkillMutation.mutate({
                      id: newSkillId,
                      name: newSkillName,
                      description: newSkillDesc,
                      systemPrompt: newSkillPrompt
                    });
                  }}
                >
                  Create Skill
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </Page>
  );
}

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
} from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card } from "../components/ui";
import { api } from "../lib/api";

export function AdminPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "support" | "templates" | "costs" | "system">("overview");

  // System drafts (Legacy states kept for compatibility)
  const [skillDrafts, setSkillDrafts] = useState<Record<string, string>>({});
  const [knowledgeDrafts, setKnowledgeDrafts] = useState<Record<string, string>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<string, string>>({});

  // Tab 1: Overview & Metrics Queries
  const { data: actor } = useQuery<any>({ queryKey: ["me"], queryFn: () => api("/auth/me") });
  const { data: overviewMetrics } = useQuery<any>({
    queryKey: ["admin-overview-metrics"],
    queryFn: () => api("/admin/metrics/overview"),
    enabled: activeTab === "overview",
  });
  const { data: usageMetrics } = useQuery<any>({
    queryKey: ["admin-usage-metrics"],
    queryFn: () => api("/admin/metrics/usage"),
    enabled: activeTab === "overview",
  });
  const { data: jobsMetrics } = useQuery<any>({
    queryKey: ["admin-jobs-metrics"],
    queryFn: () => api("/admin/metrics/jobs"),
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

  // System tab legacy queries
  const { data: skills = [] } = useQuery<any[]>({ queryKey: ["admin-skills"], queryFn: () => api("/admin/skills"), enabled: activeTab === "system" });
  const { data: mappings = [] } = useQuery<any[]>({ queryKey: ["admin-skill-mappings"], queryFn: () => api("/admin/skill-mappings"), enabled: activeTab === "system" });
  const { data: retention = [] } = useQuery<any[]>({ queryKey: ["admin-retention"], queryFn: () => api("/admin/retention"), enabled: activeTab === "system" });
  const { data: users = [] } = useQuery<any[]>({ queryKey: ["admin-users"], queryFn: () => api("/admin/users"), enabled: activeTab === "system" });
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

  // Legacy mutations
  const setMapping = useMutation({
    mutationFn: ({ eventType, skillId }: { eventType: string; skillId: string }) =>
      api(`/admin/skill-mappings/${encodeURIComponent(eventType)}`, { method: "PUT", body: JSON.stringify({ skillId }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-skill-mappings"] }),
  });
  const activate = useMutation({
    mutationFn: ({ skillId, versionId }: { skillId: string; versionId: string }) =>
      api(`/admin/skills/${skillId}/versions/${versionId}/activate`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-skills"] }),
  });
  const createSkillVersion = useMutation({
    mutationFn: ({ skillId, systemPrompt }: { skillId: string; systemPrompt: string }) =>
      api(`/admin/skills/${skillId}/versions`, { method: "POST", body: JSON.stringify({ systemPrompt }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-skills"] }),
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
    <div className="page admin-page">
      <section className="page-heading compact-heading">
        <div>
          <Badge tone="red">Internal administration</Badge>
          <h1>Platform Operations Console</h1>
          <p>Durable templates, automated cost rates, and redaction-enforced support diagnostics.</p>
        </div>
      </section>

      {/* Tabs Menu */}
      <div className="admin-tabs">
        <button className={`admin-tab ${activeTab === "overview" ? "active" : ""}`} onClick={() => setActiveTab("overview")}>
          <TrendingUp /> Overview Metrics
        </button>
        <button className={`admin-tab ${activeTab === "support" ? "active" : ""}`} onClick={() => setActiveTab("support")}>
          <Users /> Support Workspace
        </button>
        <button className={`admin-tab ${activeTab === "templates" ? "active" : ""}`} onClick={() => setActiveTab("templates")}>
          <FileText /> Document Templates
        </button>
        <button className={`admin-tab ${activeTab === "costs" ? "active" : ""}`} onClick={() => setActiveTab("costs")}>
          <DollarSign /> Costs Manager
        </button>
        <button className={`admin-tab ${activeTab === "system" ? "active" : ""}`} onClick={() => setActiveTab("system")}>
          <Settings /> System Routing
        </button>
      </div>

      {/* Tab Content 1: Overview */}
      {activeTab === "overview" && (
        <>
          <section className="admin-metrics">
            <Card>
              <Users />
              <span>Total Users</span>
              <strong>{overviewMetrics?.users ?? "-"}</strong>
            </Card>
            <Card>
              <Database />
              <span>Projects (Active)</span>
              <strong>
                {overviewMetrics?.projects ?? "-"} ({overviewMetrics?.activeProjects ?? "-"})
              </strong>
            </Card>
            <Card>
              <ShieldCheck />
              <span>Failed Jobs (30d)</span>
              <strong>{overviewMetrics?.failedJobs ?? "-"}</strong>
            </Card>
            <Card>
              <BrainCircuit />
              <span>Tokens Cost / Revenue</span>
              <strong>
                ${(((overviewMetrics?.totalCost ?? 0)) / 100).toFixed(2)}
              </strong>
              <small>
                Margin Estimate: {overviewMetrics?.margin ?? 100}%
              </small>
            </Card>
          </section>

          <div className="admin-grid" style={{ gridTemplateColumns: "1.5fr 1fr" }}>
            <Card className="admin-table" style={{ gridColumn: "span 2" }}>
              <h2>Token Usage Breakdown</h2>
              <table className="admin-wide-table">
                <thead>
                  <tr>
                    <th>Model Tier / Key</th>
                    <th>Input Tokens</th>
                    <th>Output Tokens</th>
                    <th>Estimated Cost (USD)</th>
                    <th>Invocations count</th>
                  </tr>
                </thead>
                <tbody>
                  {(usageMetrics?.byModel ?? []).map((m: any) => (
                    <tr key={m.model}>
                      <td><strong>{m.model}</strong></td>
                      <td>{m._sum.inputTokens}</td>
                      <td>{m._sum.outputTokens}</td>
                      <td>${((m._sum.costMinor ?? 0) / 100).toFixed(4)}</td>
                      <td>{m._count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card className="admin-table" style={{ gridColumn: "span 2" }}>
              <h2>Recent Failed Jobs Queue & Diagnostics</h2>
              <table className="admin-wide-table">
                <thead>
                  <tr>
                    <th>Job ID</th>
                    <th>Queue</th>
                    <th>Failure Reason</th>
                    <th>Attempts</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(jobsMetrics?.recentFailed ?? []).map((j: any) => (
                    <tr key={j.id}>
                      <td><small>{j.id.slice(0, 8)}</small></td>
                      <td><strong>{j.queue}</strong></td>
                      <td style={{ color: "var(--red)" }}>{j.error}</td>
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
                        <strong style={{ color: (supportProjectDetails?.usageSpikePercent ?? 0) > 50 ? "var(--red)" : "inherit" }}>
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
                <div style={{ display: "flex", gap: "8px", background: "#3a2121", padding: "10px", borderRadius: "8px", marginBottom: "12px", border: "1px solid var(--red)" }}>
                  <ShieldAlert style={{ color: "var(--red)" }} />
                  <p style={{ color: "var(--red)", fontSize: "11px", margin: 0 }}>
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
            <div style={{ display: "flex", gap: "8px", background: "#3a2121", padding: "10px", borderRadius: "8px", marginBottom: "12px", border: "1px solid var(--red)" }}>
              <ShieldAlert style={{ color: "var(--red)" }} />
              <p style={{ color: "var(--red)", fontSize: "11px", margin: 0 }}>
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

      {/* Tab Content 5: System Settings (Legacy views grouped here) */}
      {activeTab === "system" && (
        <div className="admin-grid">
          <Card className="admin-table">
            <h2>Skill Registry</h2>
            {skills.map((skill) => {
              const activeSkill = skill.versions.find((item: any) => item.active);
              const newest = skill.versions[0];
              const draft = skillDrafts[skill.id] ?? activeSkill?.systemPrompt ?? newest?.systemPrompt ?? "";
              return (
                <div className="admin-row admin-row--stack" key={skill.id}>
                  <div>
                    <strong>{skill.name}</strong>
                    <small>{skill.id}</small>
                  </div>
                  <div className="inline-actions">
                    {newest && newest.id !== activeSkill?.id ? (
                      <Button variant="secondary" onClick={() => activate.mutate({ skillId: skill.id, versionId: newest.id })} disabled={!isAdmin}>
                        Activate v{newest.version}
                      </Button>
                    ) : (
                      <Badge tone={activeSkill ? "green" : "amber"}>
                        {activeSkill ? `v${activeSkill.version}` : "inactive"}
                      </Badge>
                    )}
                    <Button variant="secondary" onClick={() => createSkillVersion.mutate({ skillId: skill.id, systemPrompt: draft })} disabled={!isAdmin}>
                      Create prompt version
                    </Button>
                  </div>
                  <textarea className="admin-textarea" value={draft} onChange={(event) => setSkillDrafts((current) => ({ ...current, [skill.id]: event.target.value }))} disabled={!isAdmin} />
                </div>
              );
            })}
          </Card>

          <Card className="admin-table">
            <h2>Automatic Skill Routing</h2>
            {mappings.map((mapping) => (
              <div className="admin-row" key={mapping.eventType}>
                <div>
                  <strong>{mapping.eventType}</strong>
                  <small>Resolved when the worker starts the job</small>
                </div>
                <select aria-label={`Skill for ${mapping.eventType}`} value={mapping.skillId} onChange={(event) => setMapping.mutate({ eventType: mapping.eventType, skillId: event.target.value })} disabled={!isAdmin}>
                  {skills.map((skill) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </Card>

          <Card className="admin-table">
            <h2>Report Definitions</h2>
            {reports.map((report) => {
              const activeReport = report.versions.find((item: any) => item.active) ?? report.versions[0];
              const draft = reportDrafts[report.id] ?? activeReport?.templateKey ?? "";
              return (
                <div className="admin-row admin-row--stack" key={report.id}>
                  <div>
                    <strong>{report.name}</strong>
                    <small>
                      {activeReport?.requiresLlm ? "LLM content" : "Deterministic"} · v{activeReport?.version ?? "-"}
                    </small>
                  </div>
                  <input aria-label={`Template for ${report.name}`} value={draft} onChange={(event) => setReportDrafts((current) => ({ ...current, [report.id]: event.target.value }))} disabled={!isAdmin} />
                  <Button variant="secondary" onClick={() => createReportVersion.mutate({ id: report.id, templateKey: draft })} disabled={!isAdmin}>
                    Create active version
                  </Button>
                </div>
              );
            })}
          </Card>

          <Card className="admin-table">
            <h2>Knowledge Bases</h2>
            {knowledge.map((base) => {
              const activeKb = base.versions.find((item: any) => item.active) ?? base.versions[0];
              const draft = knowledgeDrafts[base.id] ?? activeKb?.markdown ?? "";
              return (
                <div className="admin-row admin-row--stack" key={base.id}>
                  <div>
                    <strong>{base.name}</strong>
                    <small>{base.topic}</small>
                  </div>
                  <textarea className="admin-textarea" value={draft} onChange={(event) => setKnowledgeDrafts((current) => ({ ...current, [base.id]: event.target.value }))} disabled={!isAdmin} />
                  <Button variant="secondary" onClick={() => createKnowledgeVersion.mutate({ id: base.id, markdown: draft })} disabled={!isAdmin}>
                    Create active version
                  </Button>
                </div>
              );
            })}
          </Card>

          <Card className="admin-table">
            <h2>Retention Policies</h2>
            {retention.map((policy) => (
              <div className="admin-row" key={policy.id}>
                <div>
                  <strong>{policy.description}</strong>
                  <small>{policy.id}</small>
                </div>
                <input aria-label={`Days for ${policy.id}`} type="number" value={policy.retentionDays ?? ""} onChange={(event) => updateRetention.mutate({ id: policy.id, retentionDays: Number(event.target.value) })} disabled={!isAdmin} />
              </div>
            ))}
          </Card>

          <Card className="admin-table">
            <h2>Platform Users</h2>
            {users.slice(0, 20).map((user) => (
              <div className="admin-row" key={user.id}>
                <div>
                  <strong>{user.preferredName || user.email}</strong>
                  <small>{user.status}</small>
                </div>
                <select value={user.platformRole} onChange={(event) => updateRole.mutate({ id: user.id, platformRole: event.target.value })} disabled={!isAdmin}>
                  <option value="user">user</option>
                  <option value="support">support</option>
                  <option value="admin">admin</option>
                </select>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

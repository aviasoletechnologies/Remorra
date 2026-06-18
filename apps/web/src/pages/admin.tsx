import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TrendingUp,
  Users,
  DollarSign,
  FileText,
  Settings,
  Eye,
  Pencil,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Badge, Button, Card } from "../components/ui";
import { api } from "../lib/api";
import { Page, PageHeader, PageSkeleton, CardSkeleton, MetricGridSkeleton, RichTableSkeleton, FormSkeleton, AdminConsoleSkeleton } from "../components/app-ui";
import { AdminOverview } from "./admin/admin-overview";
import { AdminSupport } from "./admin/admin-support";
import { AdminCosts } from "./admin/admin-costs";
import { AdminUsers } from "./admin/admin-users";
import { AdminTemplates } from "./admin/admin-templates";
import {
  AdminFlows,
  AdminKnowledge,
  AdminRetention,
  AdminReports,
  AdminSkills,
  AdminSystemLayout,
  type AdminSystemSubTab,
} from "./admin/admin-system";

function describeSkillInputRequirement(version: any): string {
  if (typeof version?.inputRequirementText === "string" && version.inputRequirementText.trim()) {
    return version.inputRequirementText;
  }
  const mappedInputs = version?.inputSourceMap?.requiredInputs;
  if (Array.isArray(mappedInputs) && mappedInputs.length > 0) {
    return mappedInputs
      .map((item: any) => item.description || item.key)
      .filter(Boolean)
      .join(", ");
  }
  if (Array.isArray(version?.contextRequirements) && version.contextRequirements.length > 0) {
    return `Legacy context: ${version.contextRequirements.join(", ")}`;
  }
  return "";
}

function validateInputRequirementText(value: string): string | null {
  if (!value.trim()) {
    return "Input requirement text is required so the system can generate a source map.";
  }
  return null;
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"overview" | "support" | "templates" | "costs" | "system" | "users">("overview");
  const [userPage, setUserPage] = useState(1);
  const USER_PAGE_SIZE = 10;
  const [supportPage, setSupportPage] = useState(1);
  const SUPPORT_PAGE_SIZE = 10;

  // System drafts
  const [knowledgeDrafts, setKnowledgeDrafts] = useState<Record<string, string>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<string, string>>({});

  const [systemSubTab, setSystemSubTab] = useState<AdminSystemSubTab>("skills");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);

  // Skill Creation States
  const [isCreateSkillOpen, setIsCreateSkillOpen] = useState(false);
  const [newSkillId, setNewSkillId] = useState("");
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [newSkillPrompt, setNewSkillPrompt] = useState("");
  const [newSkillInputRequirementText, setNewSkillInputRequirementText] = useState("");
  const [skillCreateError, setSkillCreateError] = useState<string | null>(null);

  // Skill Editing States
  const [editingSkill, setEditingSkill] = useState<any | null>(null);
  const [editingSkillVersionId, setEditingSkillVersionId] = useState<string | null>(null);
  const [editPromptText, setEditPromptText] = useState("");
  const [editInputRequirementText, setEditInputRequirementText] = useState("");
  const [skillEditError, setSkillEditError] = useState<string | null>(null);
  const [showInputSourceMap, setShowInputSourceMap] = useState(false);


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
  const { data: actor, isLoading: loadingActor } = useQuery<any>({ queryKey: ["me"], queryFn: () => api("/auth/me") });
  const { data: overviewMetrics, isLoading: loadingOverview } = useQuery<any>({
    queryKey: ["admin-overview-metrics", period],
    queryFn: () => api(`/admin/metrics/overview${periodQuery ? `?${periodQuery}` : ""}`),
    enabled: activeTab === "overview",
  });
  const { data: usageMetrics, isLoading: loadingUsage } = useQuery<any>({
    queryKey: ["admin-usage-metrics", period],
    queryFn: () => api(`/admin/metrics/usage${periodQuery ? `?${periodQuery}` : ""}`),
    enabled: activeTab === "overview",
  });
  const { data: jobsMetrics, isLoading: loadingJobs } = useQuery<any>({
    queryKey: ["admin-jobs-metrics", period],
    queryFn: () => api(`/admin/metrics/jobs${periodQuery ? `?${periodQuery}` : ""}`),
    enabled: activeTab === "overview",
    refetchInterval: 5000,
  });

  // Tab 2: Support Projects List
  const { data: supportProjectsData, isLoading: loadingSupport } = useQuery<any>({
    queryKey: ["admin-support-projects", supportPage],
    queryFn: () => api(`/admin/support/projects?page=${supportPage}&limit=${SUPPORT_PAGE_SIZE}`),
    enabled: activeTab === "support",
  });
  const supportProjects = supportProjectsData?.items ?? [];
  const supportTotalPages = supportProjectsData?.totalPages ?? 1;

  const [selectedSupportProjectId, setSelectedSupportProjectId] = useState<string | null>(null);
  const { data: supportProjectDetails, isFetching: loadingSupportDetails } = useQuery<any>({
    queryKey: ["admin-support-project-details", selectedSupportProjectId],
    queryFn: () => api(`/admin/support/projects/${selectedSupportProjectId}`),
    enabled: activeTab === "support" && !!selectedSupportProjectId,
  });

  // Tab 3: Template Manager Queries
  const { data: templates = [], isLoading: loadingTemplates } = useQuery<any[]>({
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
  const { data: costConfigs = [], isLoading: loadingCosts } = useQuery<any[]>({
    queryKey: ["admin-cost-configs"],
    queryFn: () => api("/admin/cost-configs"),
    enabled: activeTab === "costs",
  });
  const [costDrafts, setCostDrafts] = useState<Record<string, { name: string; inputCostMinor: number; outputCostMinor: number; flatCostMinor: number; active: boolean }>>({});

  // System tab queries
  const [skillPage, setSkillPage] = useState(1);
  const SKILL_PAGE_SIZE = 10;

  const { data: skillsData, isLoading: loadingSkills } = useQuery<any>({
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

  const { data: retention = [], isLoading: loadingRetention } = useQuery<any[]>({ queryKey: ["admin-retention"], queryFn: () => api("/admin/retention"), enabled: activeTab === "system" });
  const { data: usersData, isLoading: loadingUsers } = useQuery<any>({
    queryKey: ["admin-users", userPage],
    queryFn: () => api(`/admin/users?page=${userPage}&limit=${USER_PAGE_SIZE}`),
    enabled: activeTab === "users",
  });
  const users = usersData?.items ?? [];
  const totalPages = usersData?.totalPages ?? 1;
  const { data: reports = [], isLoading: loadingReports } = useQuery<any[]>({ queryKey: ["admin-reports"], queryFn: () => api("/admin/reports"), enabled: activeTab === "system" });
  const { data: knowledge = [], isLoading: loadingKnowledge } = useQuery<any[]>({ queryKey: ["admin-knowledge"], queryFn: () => api("/admin/knowledge-bases"), enabled: activeTab === "system" });

  const isAdmin = actor?.platformRole === "admin";

  if (loadingActor) {
    return <AdminConsoleSkeleton />;
  }

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

  const activate = useMutation({
    mutationFn: ({ skillId, versionId }: { skillId: string; versionId: string }) =>
      api(`/admin/skills/${skillId}/versions/${versionId}/activate`, { method: "POST" }),
    onSuccess: (version: any) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-skills"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-all-skills-list"] });
      setEditingSkill((current: any) => current?.id === version.skillId
        ? {
            ...current,
            versions: current.versions.map((item: any) => ({ ...item, active: item.id === version.id })),
          }
        : current,
      );
    },
  });
  const createSkillVersion = useMutation({
    mutationFn: ({ skillId, systemPrompt, inputRequirementText }: { skillId: string; systemPrompt: string; inputRequirementText: string }) =>
      api(`/admin/skills/${skillId}/versions`, {
        method: "POST",
        body: JSON.stringify({ systemPrompt, inputRequirementText }),
      }),
    onSuccess: (version: any) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-skills"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-all-skills-list"] });
      setEditingSkill((current: any) => current?.id === version.skillId
        ? {
            ...current,
            versions: [version, ...current.versions.filter((item: any) => item.id !== version.id)]
              .sort((a: any, b: any) => b.version - a.version),
          }
        : current,
      );
      setEditingSkillVersionId(version.id);
    },
    onError: (err: any) => {
      setSkillEditError(err.message || "Skill input requirements could not be mapped to known data sources.");
    },
  });
  const updateSkillVersion = useMutation({
    mutationFn: ({ skillId, versionId, systemPrompt, inputRequirementText }: { skillId: string; versionId: string; systemPrompt: string; inputRequirementText: string }) =>
      api(`/admin/skills/${skillId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({ systemPrompt, inputRequirementText }),
      }),
    onSuccess: (version: any) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-skills"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-all-skills-list"] });
      setEditingSkill((current: any) => current?.id === version.skillId
        ? {
            ...current,
            versions: current.versions.map((item: any) => item.id === version.id ? version : item),
          }
        : current,
      );
      setSkillEditError(null);
    },
    onError: (err: any) => {
      setSkillEditError(err.message || "Skill version could not be updated.");
    },
  });
  const deleteSkillVersion = useMutation({
    mutationFn: ({ skillId, versionId }: { skillId: string; versionId: string }) =>
      api(`/admin/skills/${skillId}/versions/${versionId}`, { method: "DELETE" }),
    onSuccess: (_res, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-skills"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-all-skills-list"] });
      setEditingSkill((current: any) => {
        if (current?.id !== variables.skillId) return current;
        const nextVersions = current.versions.filter((item: any) => item.id !== variables.versionId);
        setEditingSkillVersionId(nextVersions[0]?.id ?? null);
        if (nextVersions.length === 0) return null;
        return { ...current, versions: nextVersions };
      });
    },
    onError: (err: any) => {
      setSkillEditError(err.message || "Skill version could not be deleted.");
    },
  });
  const createSkillMutation = useMutation({
    mutationFn: (data: { id: string; name: string; description: string; systemPrompt: string; inputRequirementText: string }) =>
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
      setNewSkillInputRequirementText("");
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

  const previewSelectedTemplate = () => {
    if (!selectedTemplate) return;
    try {
      const parsedData = JSON.parse(sampleJsonText);
      const parsedSchema = templateSchemaText ? JSON.parse(templateSchemaText) : null;
      previewTemplate.mutate({
        id: selectedTemplate.id,
        html: templateHtml,
        css: templateCss,
        schema: parsedSchema,
        sampleData: parsedData,
      });
    } catch (error: any) {
      setValidationError("Invalid JSON in sample data or schema: " + error.message);
    }
  };

  const createSelectedTemplateVersion = () => {
    if (!selectedTemplate) return;
    try {
      const parsedSchema = templateSchemaText ? JSON.parse(templateSchemaText) : null;
      createTemplateVersion.mutate({
        id: selectedTemplate.id,
        html: templateHtml,
        css: templateCss,
        schema: parsedSchema,
      });
    } catch (error: any) {
      setValidationError("Invalid JSON in schema: " + error.message);
    }
  };

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

      {activeTab === "overview" && (
        <AdminOverview
          period={period}
          setPeriod={setPeriod}
          overviewMetrics={overviewMetrics}
          usageMetrics={usageMetrics}
          jobsMetrics={jobsMetrics}
          onRetryJob={(id) => retryJob.mutate(id)}
          isLoading={loadingOverview || loadingUsage || loadingJobs}
        />
      )}

      {activeTab === "support" && (
        <AdminSupport
          projects={supportProjects}
          selectedProjectId={selectedSupportProjectId}
          projectDetails={supportProjectDetails}
          loading={loadingSupportDetails}
          onSelectProject={setSelectedSupportProjectId}
          onCloseProject={() => setSelectedSupportProjectId(null)}
          page={supportPage}
          totalPages={supportTotalPages}
          setPage={setSupportPage}
          isLoading={loadingSupport}
        />
      )}

      {activeTab === "templates" && (
        <AdminTemplates
          templates={templates}
          selectedTemplate={selectedTemplate}
          selectedTemplateId={selectedTemplateId}
          isAdmin={isAdmin}
          templateHtml={templateHtml}
          templateCss={templateCss}
          templateSchemaText={templateSchemaText}
          sampleJsonText={sampleJsonText}
          previewHtml={previewHtml}
          validationError={validationError}
          onSelectTemplate={selectTemplate}
          onTemplateHtml={setTemplateHtml}
          onTemplateCss={setTemplateCss}
          onTemplateSchema={setTemplateSchemaText}
          onSampleJson={setSampleJsonText}
          onPreview={previewSelectedTemplate}
          onCreateVersion={createSelectedTemplateVersion}
          onActivateVersion={(versionId) => activateTemplateVersion.mutate({ id: selectedTemplate.id, versionId })}
          isLoading={loadingTemplates}
        />
      )}

      {activeTab === "costs" && (
        <AdminCosts
          configs={costConfigs}
          drafts={costDrafts}
          isAdmin={isAdmin}
          setDrafts={setCostDrafts}
          onSave={(key, data) => updateCostConfig.mutate({ key, data })}
          isLoading={loadingCosts}
        />
      )}

      {/* Tab Content 5: System Settings (Sub-nav Layout) */}
      {activeTab === "system" && (
        <AdminSystemLayout active={systemSubTab} onChange={setSystemSubTab}>
            {systemSubTab === "flows" && <AdminFlows isAdmin={isAdmin} />}
            {systemSubTab === "skills" && (
              <AdminSkills
                skills={skills}
                page={skillPage}
                totalPages={totalSkillPages}
                isAdmin={isAdmin}
                onCreate={() => setIsCreateSkillOpen(true)}
                onEdit={(skill) => {
                  setEditingSkill(skill);
                  const currentVer = skill.versions.find((version: any) => version.active) ?? skill.versions[0];
                  setEditingSkillVersionId(currentVer?.id ?? null);
                  setEditPromptText(currentVer?.systemPrompt ?? "");
                  setEditInputRequirementText(describeSkillInputRequirement(currentVer));
                  setSkillEditError(null);
                  setShowInputSourceMap(false);
                }}
                onPage={setSkillPage}
                isLoading={loadingSkills}
              />
            )}


            {systemSubTab === "reports" && (
              <AdminReports
                reports={reports}
                selectedReportId={selectedReportId}
                reportDrafts={reportDrafts}
                isAdmin={isAdmin}
                onSelectReport={setSelectedReportId}
                onDraft={setReportDrafts}
                onPublish={(id, templateKey) => createReportVersion.mutate({ id, templateKey })}
                isLoading={loadingReports}
              />
            )}

            {systemSubTab === "knowledge" && (
              <AdminKnowledge
                knowledge={knowledge}
                selectedKbId={selectedKbId}
                knowledgeDrafts={knowledgeDrafts}
                isAdmin={isAdmin}
                onSelectKnowledge={setSelectedKbId}
                onDraft={setKnowledgeDrafts}
                onPublish={(id, markdown) => createKnowledgeVersion.mutate({ id, markdown })}
                isLoading={loadingKnowledge}
              />
            )}

            {systemSubTab === "retention" && (
              <AdminRetention
                retention={retention}
                isAdmin={isAdmin}
                onUpdate={(id, retentionDays) => updateRetention.mutate({ id, retentionDays })}
                isLoading={loadingRetention}
              />
            )}
        </AdminSystemLayout>
      )}

      {activeTab === "users" && (
        <AdminUsers
          users={users}
          page={userPage}
          totalPages={totalPages}
          isAdmin={isAdmin}
          setPage={setUserPage}
          onUpdateRole={(id, platformRole) => updateRole.mutate({ id, platformRole })}
          isLoading={loadingUsers}
        />
      )}
      {/* Skill Edit Modal */}
      {editingSkill && createPortal(
        <div className="admin-modal-overlay">
          <Card className="admin-modal-content admin-skill-version-modal">
            <div className="modal-header">
              <div>
                <h2>Manage Skill Versions: {editingSkill.name}</h2>
                <code>{editingSkill.id}</code>
              </div>
              <Button variant="ghost" onClick={() => {
                setEditingSkill(null);
                setEditingSkillVersionId(null);
              }}>
                Close
              </Button>
            </div>

            <div className="modal-body">
              {(() => {
                const activeVer = editingSkill.versions.find((item: any) => item.active);
                const currentVer = editingSkill.versions.find((item: any) => item.id === editingSkillVersionId) ?? activeVer ?? editingSkill.versions[0];
                const inputSourceMap = currentVer?.inputSourceMap ?? { requiredInputs: [] };
                const mappedCount = Array.isArray(inputSourceMap?.requiredInputs) ? inputSourceMap.requiredInputs.length : 0;
                const selectVersion = (version: any) => {
                  setEditingSkillVersionId(version.id);
                  setEditPromptText(version.systemPrompt ?? "");
                  setEditInputRequirementText(describeSkillInputRequirement(version));
                  setSkillEditError(null);
                  setShowInputSourceMap(false);
                };
                return (
                  <>
                    <div className="modal-version-row">
                      <span>
                        Active Version: {activeVer ? <Badge tone="green">v{activeVer.version}</Badge> : <Badge tone="amber">None</Badge>}
                      </span>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          const error = validateInputRequirementText(editInputRequirementText);
                          if (error) {
                            setSkillEditError(error);
                            return;
                          }
                          createSkillVersion.mutate({
                            skillId: editingSkill.id,
                            systemPrompt: editPromptText,
                            inputRequirementText: editInputRequirementText,
                          });
                        }}
                        disabled={!isAdmin || createSkillVersion.isPending || !currentVer}
                      >
                        <Pencil size={14} /> Save as New Version
                      </Button>
                    </div>

                    <div className="skill-version-manager">
                      <aside className="skill-version-list">
                        {editingSkill.versions.map((version: any) => (
                          <button
                            key={version.id}
                            type="button"
                            className={`skill-version-item ${currentVer?.id === version.id ? "active" : ""}`}
                            onClick={() => selectVersion(version)}
                          >
                            <span>v{version.version}</span>
                            <div>
                              {version.active ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Draft</Badge>}
                            </div>
                          </button>
                        ))}
                      </aside>

                      <section className="skill-version-editor">
                        <div className="modal-version-row">
                          <div>
                            <label className="admin-field-label">Selected Version</label>
                            <strong>v{currentVer?.version ?? "-"}</strong>
                          </div>
                          <div className="skill-source-map-actions">
                            <Button
                              variant="secondary"
                              disabled={!isAdmin || !currentVer || currentVer.active || activate.isPending}
                              onClick={() => {
                                if (!currentVer) return;
                                activate.mutate({ skillId: editingSkill.id, versionId: currentVer.id });
                              }}
                            >
                              <CheckCircle2 size={14} /> Activate
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={!isAdmin || !currentVer || currentVer.active || deleteSkillVersion.isPending}
                              onClick={() => {
                                if (!currentVer) return;
                                if (!window.confirm(`Delete v${currentVer.version}? This cannot be undone.`)) return;
                                deleteSkillVersion.mutate({ skillId: editingSkill.id, versionId: currentVer.id });
                              }}
                            >
                              <Trash2 size={14} /> Delete
                            </Button>
                          </div>
                        </div>

                        <div className="editor-section">
                          <label className="admin-field-label">System Prompt Template</label>
                          <textarea
                            className="admin-textarea monospace"
                            value={editPromptText}
                            onChange={(e) => setEditPromptText(e.target.value)}
                            disabled={!isAdmin || !currentVer}
                          />
                        </div>

                        <div className="editor-section">
                          <div className="modal-version-row skill-input-header">
                            <label className="admin-field-label">Input Requirement Text</label>
                            <div className="skill-source-map-actions">
                              <Badge tone={mappedCount > 0 ? "green" : "amber"}>
                                {mappedCount > 0 ? `${mappedCount} mapped input${mappedCount === 1 ? "" : "s"}` : "No mapped inputs"}
                              </Badge>
                              <Button variant="secondary" onClick={() => setShowInputSourceMap((value) => !value)}>
                                <Eye size={14} /> View source map
                              </Button>
                            </div>
                          </div>
                          <textarea
                            className="admin-textarea monospace"
                            value={editInputRequirementText}
                            onChange={(e) => {
                              setEditInputRequirementText(e.target.value);
                              setSkillEditError(null);
                            }}
                            placeholder="Example: Need project name and project summary"
                            disabled={!isAdmin || !currentVer}
                          />
                          {skillEditError && (
                            <p className="form-message" role="alert">{skillEditError}</p>
                          )}
                          <p className="form-help">
                            Save updates the selected version. Save as New Version creates a separate version from the current edits.
                          </p>
                          {showInputSourceMap && (
                            <pre className="admin-json-preview">
                              {JSON.stringify(inputSourceMap, null, 2)}
                            </pre>
                          )}
                        </div>

                        {isAdmin && (
                          <div className="form-actions">
                            <Button
                              disabled={updateSkillVersion.isPending || !currentVer}
                              onClick={() => {
                                if (!currentVer) return;
                                const error = validateInputRequirementText(editInputRequirementText);
                                if (error) {
                                  setSkillEditError(error);
                                  return;
                                }
                                updateSkillVersion.mutate({
                                  skillId: editingSkill.id,
                                  versionId: currentVer.id,
                                  systemPrompt: editPromptText,
                                  inputRequirementText: editInputRequirementText,
                                });
                              }}
                            >
                              {updateSkillVersion.isPending ? "Saving..." : "Save Selected Version"}
                            </Button>
                          </div>
                        )}
                      </section>
                    </div>
                  </>
                );
              })()}
            </div>
          </Card>
        </div>,
        document.body
      )}

      {/* Skill Create Modal */}
      {isCreateSkillOpen && createPortal(
        <div className="admin-modal-overlay">
          <Card className="admin-modal-content">
            <div className="modal-header">
              <h2>Create New Agent Skill</h2>
              <Button variant="ghost" onClick={() => {
                setIsCreateSkillOpen(false);
                setSkillCreateError(null);
                setNewSkillInputRequirementText("");
              }}>
                Close
              </Button>
            </div>

            <div className="modal-body">
              <div>
                <label className="admin-field-label">Skill ID (unique slug)</label>
                <input
                  type="text"
                  placeholder="e.g. risk-evaluator"
                  className="admin-input"
                  value={newSkillId}
                  onChange={(e) => setNewSkillId(e.target.value)}
                />
              </div>

              <div>
                <label className="admin-field-label">Skill Name</label>
                <input
                  type="text"
                  placeholder="e.g. Risk Evaluator"
                  className="admin-input"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                />
              </div>

              <div>
                <label className="admin-field-label">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Evaluates project delivery risks"
                  className="admin-input"
                  value={newSkillDesc}
                  onChange={(e) => setNewSkillDesc(e.target.value)}
                />
              </div>

              <div>
                <label className="admin-field-label">Initial System Prompt</label>
                <textarea
                  placeholder="You are an expert agent that..."
                  className="admin-textarea monospace"
                  value={newSkillPrompt}
                  onChange={(e) => setNewSkillPrompt(e.target.value)}
                />
              </div>

              <div>
                <label className="admin-field-label">Input Requirement Text</label>
                <textarea
                  placeholder="Example: Need project name and project summary"
                  className="admin-textarea monospace skill-input-requirement-textarea"
                  value={newSkillInputRequirementText}
                  onChange={(e) => {
                    setNewSkillInputRequirementText(e.target.value);
                    setSkillCreateError(null);
                  }}
                />
                <p className="form-help">
                  This is validated and converted into a read-only source map when the skill is created.
                </p>
              </div>

              {skillCreateError && (
                <p className="form-message" role="alert">{skillCreateError}</p>
              )}

              <div className="form-actions">
                <Button
                  onClick={() => {
                    if (!newSkillId || !newSkillName || !newSkillDesc || !newSkillPrompt) {
                      setSkillCreateError("All fields are required.");
                      return;
                    }
                    const error = validateInputRequirementText(newSkillInputRequirementText);
                    if (error) {
                      setSkillCreateError(error);
                      return;
                    }
                    createSkillMutation.mutate({
                      id: newSkillId,
                      name: newSkillName,
                      description: newSkillDesc,
                      systemPrompt: newSkillPrompt,
                      inputRequirementText: newSkillInputRequirementText,
                    });
                  }}
                  disabled={createSkillMutation.isPending}
                >
                  {createSkillMutation.isPending ? "Validating..." : "Create Skill"}
                </Button>
              </div>
            </div>
          </Card>
        </div>,
        document.body
      )}
    </Page>
  );
}

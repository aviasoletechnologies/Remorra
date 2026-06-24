import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Badge, Button, Card } from "../components/ui";
import { api } from "../lib/api";
import { Page, PageHeader, PageSkeleton, CardSkeleton, MetricGridSkeleton, RichTableSkeleton, FormSkeleton, AdminConsoleSkeleton } from "../components/app-ui";
import { AdminOverview } from "./admin/admin-overview";
import { AdminSupport } from "./admin/admin-support";
import { AdminCosts } from "./admin/admin-costs";
import { AdminUsers } from "./admin/admin-users";
import { AdminTemplates } from "./admin/admin-templates";
import Editor from "@monaco-editor/react";
import { useConfirm } from "../components/confirm-dialog";
import {
  AdminFlows,
  AdminKnowledge,
  AdminRetention,
  AdminReports,
  AdminSkills,
  AdminSystemLayout,
  type AdminSystemSubTab,
} from "./admin/admin-system";

function parseInputSourceMap(val: any): any {
  if (!val) return { skills: [], tables: {} };
  if (typeof val === "string") {
    try {
      return parseInputSourceMap(JSON.parse(val));
    } catch {
      return { skills: [], tables: {} };
    }
  }
  if (typeof val === "object") {
    const rawSkills = Array.isArray(val.skills) ? val.skills : [];
    const skills = rawSkills.length > 0 ? ["@previous"] : [];
    return {
      skills,
      tables: val.tables && typeof val.tables === "object" ? val.tables : {}
    };
  }
  return { skills: [], tables: {} };
}

function describeSkillInputRequirement(version: any): string {
  const sourceMap = parseInputSourceMap(version?.inputSourceMap);
  const parts: string[] = [];
  const skills = sourceMap.skills;
  const tables = Object.keys(sourceMap.tables);
  if (skills.length > 0) {
    const skillLabels = skills.map((s: string) => s === "@previous" ? "Previous Skill" : s);
    parts.push(`Skills: ${skillLabels.join(", ")}`);
  }
  if (tables.length > 0) {
    parts.push(`Tables: ${tables.join(", ")}`);
  }
  if (parts.length > 0) {
    return `Dynamic context: ${parts.join(" | ")}`;
  }
  return "";
}

function parseOutputSchema(val: any): { type: string; value: any } {
  if (!val) return { type: "text", value: "" };
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return parseOutputSchema(parsed);
    } catch {
      return { type: "text", value: val };
    }
  }
  return { type: val.type || "text", value: val.value || "" };
}

function describeOutputSchema(schema: any): string {
  if (!schema || !schema.value) return "No output schema defined";
  if (schema.type === "table") {
    if (typeof schema.value === "object" && schema.value !== null) {
      const tables = Object.keys(schema.value);
      return tables.length > 0 ? `Tables: ${tables.join(", ")}` : "No tables configured";
    }
    return `Table: ${schema.value}`;
  }
  if (schema.type === "custom") return `Custom Schema defined`;
  if (schema.type === "text") return `Text rules defined`;
  return "No output schema defined";
}



function describeInputSourceMap(sourceMap: any): string {
  if (!sourceMap) return "No dynamic context configured";
  const skillsCount = sourceMap.skills?.length || 0;
  const tablesCount = Object.keys(sourceMap.tables || {}).length;
  
  if (skillsCount === 0 && tablesCount === 0) {
    return "No dynamic context configured";
  }
  
  const parts: string[] = [];
  if (skillsCount > 0) {
    if (sourceMap.skills.includes("@previous")) {
      parts.push("Previous skill output");
    } else {
      parts.push(`${skillsCount} skill${skillsCount > 1 ? "s" : ""}`);
    }
  }
  if (tablesCount > 0) {
    parts.push(`${tablesCount} table${tablesCount > 1 ? "s" : ""}`);
  }
  return `Configured: ${parts.join(" and ")}`;
}


export function AdminPage() {
  const confirm = useConfirm();
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

  // KB create form state
  const [isCreateKbOpen, setIsCreateKbOpen] = useState(false);
  const [newKbId, setNewKbId] = useState("");
  const [newKbName, setNewKbName] = useState("");
  const [newKbDesc, setNewKbDesc] = useState("");
  const [newKbTopic, setNewKbTopic] = useState("");
  const [newKbMarkdown, setNewKbMarkdown] = useState("");

  // Skill Creation States
  const [isCreateSkillOpen, setIsCreateSkillOpen] = useState(false);
  const [newSkillId, setNewSkillId] = useState("");
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [newSkillPrompt, setNewSkillPrompt] = useState("");
  const [newSkillKbEligible, setNewSkillKbEligible] = useState(false);
  const [newSkillInputSourceMap, setNewSkillInputSourceMap] = useState<any>({ skills: [], tables: {} });
  const [newSkillOutputSchema, setNewSkillOutputSchema] = useState<any>({ type: "text", value: "" });
  const [skillCreateError, setSkillCreateError] = useState<string | null>(null);
  const [isCreateContextConfigOpen, setIsCreateContextConfigOpen] = useState(false);
  const [isCreateOutputSchemaConfigOpen, setIsCreateOutputSchemaConfigOpen] = useState(false);

  const [editingSkill, setEditingSkill] = useState<any | null>(null);
  const [editingSkillVersionId, setEditingSkillVersionId] = useState<string | null>(null);
  const [editPromptText, setEditPromptText] = useState("");
  const [editSkillName, setEditSkillName] = useState("");
  const [editSkillDesc, setEditSkillDesc] = useState("");
  const [editKbEligible, setEditKbEligible] = useState(false);
  const [editInputSourceMap, setEditInputSourceMap] = useState<any>({ skills: [], tables: {} });
  const [editOutputSchema, setEditOutputSchema] = useState<any>({ type: "text", value: "" });
  const [skillEditError, setSkillEditError] = useState<string | null>(null);
  const [isContextConfigOpen, setIsContextConfigOpen] = useState(false);
  const [isOutputSchemaConfigOpen, setIsOutputSchemaConfigOpen] = useState(false);


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

  const { data: dbSchema = {} } = useQuery<Record<string, string[]>>({
    queryKey: ["admin-db-schema"],
    queryFn: () => api("/admin/db-schema"),
    enabled: activeTab === "system",
  });

  const ALLOWED_TABLES = ["Project", "Persona", "PainPoint", "UserNeed", "Ambition", "Okr", "UserStory", "Task"];
  const filteredDbSchema = Object.fromEntries(
    Object.entries(dbSchema).filter(([tableName]) => ALLOWED_TABLES.includes(tableName))
  );

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
      toast.success("Successfully created new template version!");
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
      toast.success("Template rendering preview updated.");
    },
    onError: (err: any) => {
      setValidationError(err.message || "Template rendering preview failed.");
      toast.error(err.message || "Template rendering preview failed.");
    },
  });

  const activateTemplateVersion = useMutation({
    mutationFn: ({ id, versionId }: { id: string; versionId: string }) =>
      api(`/admin/templates/${id}/versions/${versionId}/activate`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-templates"] });
      toast.success("Template version activated transactionally!");
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
      toast.success("Cost configuration updated successfully!");
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
      toast.success("Skill version activated!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to activate skill version.");
    },
  });
  const createSkillVersion = useMutation({
    mutationFn: ({ skillId, systemPrompt, inputSourceMap, outputSchema, name, description, kbEligible }: { skillId: string; systemPrompt: string; inputSourceMap?: any; outputSchema?: any; name?: string; description?: string; kbEligible?: boolean }) =>
      api(`/admin/skills/${skillId}/versions`, {
        method: "POST",
        body: JSON.stringify({ systemPrompt, inputSourceMap, outputSchema, name, description, kbEligible }),
      }),
    onSuccess: (version: any, variables: any) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-skills"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-all-skills-list"] });
      setEditingSkill((current: any) => current?.id === version.skillId
        ? {
            ...current,
            name: variables.name ?? current.name,
            description: variables.description ?? current.description,
            versions: [version, ...current.versions.filter((item: any) => item.id !== version.id)]
              .sort((a: any, b: any) => b.version - a.version),
          }
        : current,
      );
      setEditingSkillVersionId(version.id);
      if (version.warnings?.length) {
        setSkillEditError(`Saved with warnings: ${version.warnings.join("; ")}`);
        toast.success("Skill version created.");
      } else {
        setSkillEditError(null);
        toast.success("Successfully created new skill version!");
      }
      setEditingSkill(null);
      setEditingSkillVersionId(null);
      setIsContextConfigOpen(false);
      setIsOutputSchemaConfigOpen(false);
    },
    onError: (err: any) => {
      setSkillEditError(err.message || "Failed to create skill version.");
      toast.error(err.message || "Failed to create skill version.");
    },
  });
  const updateSkillVersion = useMutation({
    mutationFn: ({ skillId, versionId, systemPrompt, inputSourceMap, outputSchema, name, description, kbEligible }: { skillId: string; versionId: string; systemPrompt: string; inputSourceMap?: any; outputSchema?: any; name?: string; description?: string; kbEligible?: boolean }) =>
      api(`/admin/skills/${skillId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({ systemPrompt, inputSourceMap, outputSchema, name, description, kbEligible }),
      }),
    onSuccess: (version: any, variables: any) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-skills"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-all-skills-list"] });
      setEditingSkill((current: any) => current?.id === version.skillId
        ? {
            ...current,
            name: variables.name ?? current.name,
            description: variables.description ?? current.description,
            versions: current.versions.map((item: any) => item.id === version.id ? version : item),
          }
        : current,
      );
      if (version.warnings?.length) {
        setSkillEditError(`Saved with warnings: ${version.warnings.join("; ")}`);
        toast.success("Skill version saved.");
      } else {
        setSkillEditError(null);
        toast.success("Skill version updated successfully!");
      }
      setEditingSkill(null);
      setEditingSkillVersionId(null);
      setIsContextConfigOpen(false);
      setIsOutputSchemaConfigOpen(false);
    },
    onError: (err: any) => {
      setSkillEditError(err.message || "Failed to update skill version.");
      toast.error(err.message || "Failed to update skill version.");
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
      toast.success("Skill version deleted successfully!");
    },
    onError: (err: any) => {
      setSkillEditError(err.message || "Skill version could not be deleted.");
      toast.error(err.message || "Failed to delete skill version.");
    },
  });
  const deleteSkill = useMutation({
    mutationFn: (skillId: string) =>
      api(`/admin/skills/${skillId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-skills"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-all-skills-list"] });
      toast.success("Skill deleted successfully!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete skill.");
    },
  });
  const createSkillMutation = useMutation({
    mutationFn: (data: { id: string; name: string; description: string; systemPrompt: string; inputSourceMap?: any; outputSchema?: any; kbEligible?: boolean }) =>
      api("/admin/skills", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (result: any) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-skills"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-all-skills-list"] });
      setIsCreateSkillOpen(false);
      setNewSkillId("");
      setNewSkillName("");
      setNewSkillDesc("");
      setNewSkillPrompt("");
      setNewSkillKbEligible(false);
      setNewSkillInputSourceMap({ skills: [], tables: {} });
      setNewSkillOutputSchema({ type: "text", value: "" });
      setSkillCreateError(null);
      setIsCreateContextConfigOpen(false);
      setIsCreateOutputSchemaConfigOpen(false);
      if (result?.warnings?.length) {
        toast.success(`Skill created (warning: ${result.warnings.join("; ")})`);
      } else {
        toast.success("Skill created successfully!");
      }
    },
    onError: (err: any) => {
      setSkillCreateError(err.message || "Failed to create skill.");
      toast.error(err.message || "Failed to create skill.");
    }
  });
  const createKnowledgeMutation = useMutation({
    mutationFn: (data: { id: string; name: string; description: string; markdown: string; topic?: string }) =>
      api("/admin/knowledge-bases", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (result: any) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-knowledge"] });
      setIsCreateKbOpen(false);
      setNewKbId(""); setNewKbName(""); setNewKbDesc(""); setNewKbTopic(""); setNewKbMarkdown("");
      setSelectedKbId(result?.id ?? null);
      toast.success("Knowledge base created!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to create knowledge base.");
    },
  });
  const createKnowledgeVersion = useMutation({
    mutationFn: ({ id, markdown }: { id: string; markdown: string }) =>
      api(`/admin/knowledge-bases/${id}/versions`, { method: "POST", body: JSON.stringify({ markdown, activate: true }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-knowledge"] });
      toast.success("Knowledge base version updated!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update knowledge base.");
    },
  });
  const createReportVersion = useMutation({
    mutationFn: ({ id, templateKey }: { id: string; templateKey: string }) =>
      api(`/admin/reports/${id}/versions`, { method: "POST", body: JSON.stringify({ templateKey, activate: true }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      toast.success("Report version updated!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update report version.");
    },
  });
  const retryJob = useMutation({
    mutationFn: (id: string) => api(`/admin/jobs/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-jobs"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-jobs-metrics"] });
      toast.success("Job retry scheduled!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to retry job.");
    },
  });
  const updateRetention = useMutation({
    mutationFn: ({ id, retentionDays }: { id: string; retentionDays: number }) =>
      api(`/admin/retention/${id}`, { method: "PATCH", body: JSON.stringify({ retentionDays }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-retention"] });
      toast.success("Retention policy updated!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update retention policy.");
    },
  });
  const updateRole = useMutation({
    mutationFn: ({ id, platformRole }: { id: string; platformRole: string }) =>
      api(`/admin/users/${id}/platform-role`, { method: "PATCH", body: JSON.stringify({ platformRole }) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("User role updated successfully!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to update user role.");
    },
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
                  setEditSkillName(skill.name ?? "");
                  setEditSkillDesc(skill.description ?? "");
                  setEditKbEligible(skill.kbEligible ?? false);
                  setEditInputSourceMap(parseInputSourceMap(currentVer?.inputSourceMap));
                  setEditOutputSchema(parseOutputSchema(currentVer?.outputSchema));
                  setSkillEditError(null);
                }}
                onDelete={(skill) => deleteSkill.mutate(skill.id)}
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
                isCreateOpen={isCreateKbOpen}
                onOpenCreate={() => setIsCreateKbOpen(true)}
                onCloseCreate={() => { setIsCreateKbOpen(false); setNewKbId(""); setNewKbName(""); setNewKbDesc(""); setNewKbTopic(""); setNewKbMarkdown(""); }}
                newKbId={newKbId} onNewKbId={setNewKbId}
                newKbName={newKbName} onNewKbName={setNewKbName}
                newKbDesc={newKbDesc} onNewKbDesc={setNewKbDesc}
                newKbTopic={newKbTopic} onNewKbTopic={setNewKbTopic}
                newKbMarkdown={newKbMarkdown} onNewKbMarkdown={setNewKbMarkdown}
                onCreateSubmit={() => createKnowledgeMutation.mutate({ id: newKbId, name: newKbName, description: newKbDesc, markdown: newKbMarkdown, topic: newKbTopic || undefined })}
                isCreating={createKnowledgeMutation.isPending}
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
      {editingSkill && (() => {
        const activeVer = editingSkill.versions.find((item: any) => item.active);
        const currentVer = editingSkill.versions.find((item: any) => item.id === editingSkillVersionId) ?? activeVer ?? editingSkill.versions[0];
        const selectVersion = (version: any) => {
          setEditingSkillVersionId(version.id);
          setEditPromptText(version.systemPrompt ?? "");
          setEditInputSourceMap(parseInputSourceMap(version.inputSourceMap));
          setEditOutputSchema(parseOutputSchema(version.outputSchema));
          setSkillEditError(null);
        };

        return createPortal(
          <div className="admin-drawer-overlay" onClick={(e) => {
            if (e.target === e.currentTarget) {
              setEditingSkill(null);
              setEditingSkillVersionId(null);
              setIsContextConfigOpen(false);
            }
          }}>
            <div className="admin-drawer-content">
              <div className="admin-drawer-header">
                <div>
                  <h2>Manage Skill Versions: {editingSkill.name}</h2>
                  <code>{editingSkill.id}</code>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && currentVer && (
                    <>
                      <Button
                        disabled={updateSkillVersion.isPending}
                        onClick={() => {
                          updateSkillVersion.mutate({
                            skillId: editingSkill.id,
                            versionId: currentVer.id,
                            systemPrompt: editPromptText,
                            inputSourceMap: editInputSourceMap,
                            outputSchema: editOutputSchema,
                            name: editSkillName,
                            description: editSkillDesc,
                            kbEligible: editKbEligible,
                          });
                        }}
                      >
                        {updateSkillVersion.isPending ? "Saving..." : "Save Selected Version"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          createSkillVersion.mutate({
                            skillId: editingSkill.id,
                            systemPrompt: editPromptText,
                            inputSourceMap: editInputSourceMap,
                            outputSchema: editOutputSchema,
                            name: editSkillName,
                            description: editSkillDesc,
                            kbEligible: editKbEligible,
                          });
                        }}
                        disabled={createSkillVersion.isPending}
                      >
                        {createSkillVersion.isPending ? "Saving..." : "Save as New Version"}
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" onClick={() => {
                    setEditingSkill(null);
                    setEditingSkillVersionId(null);
                    setIsContextConfigOpen(false);
                  }}>
                    Close
                  </Button>
                </div>
              </div>

              <div className="admin-drawer-body">
                {skillEditError && (
                  <p className="form-message mb-4" role="alert">{skillEditError}</p>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 border-b pb-6">
                  <div>
                    <label className="admin-field-label">Skill Name</label>
                    <input
                      type="text"
                      className="admin-input"
                      value={editSkillName}
                      onChange={(e) => setEditSkillName(e.target.value)}
                      disabled={!isAdmin || !currentVer}
                    />
                  </div>
                  <div>
                    <label className="admin-field-label">Description</label>
                    <input
                      type="text"
                      className="admin-input"
                      value={editSkillDesc}
                      onChange={(e) => setEditSkillDesc(e.target.value)}
                      disabled={!isAdmin || !currentVer}
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <label className="admin-field-label mb-0">KB Injection Eligible</label>
                    <input
                      type="checkbox"
                      checked={editKbEligible}
                      onChange={(e) => setEditKbEligible(e.target.checked)}
                      disabled={!isAdmin || !currentVer}
                      className="h-4 w-4 cursor-pointer"
                    />
                    <span className="text-xs text-muted-foreground">Enable knowledge base injection for this skill</span>
                  </div>
                </div>

                <div className="skill-version-manager">
                  <aside className="skill-version-list">
                    <div className="flex items-center h-8 mb-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        Active Version: {activeVer ? <Badge tone="green">v{activeVer.version}</Badge> : <Badge tone="amber">None</Badge>}
                      </span>
                    </div>
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
                    <div className="flex justify-between items-center h-8 mb-2">
                      <label className="text-sm font-medium text-muted-foreground">System Prompt Template</label>
                      {currentVer && !currentVer.active && isAdmin && (
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={activate.isPending}
                            onClick={() => {
                              activate.mutate({ skillId: editingSkill.id, versionId: currentVer.id });
                            }}
                          >
                            <CheckCircle2 size={14} /> Activate
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={deleteSkillVersion.isPending}
                            onClick={async () => {
                              const confirmed = await confirm({
                                title: "Delete skill version",
                                description: `Delete v${currentVer.version}? This cannot be undone.`,
                                confirmText: "Delete",
                                variant: "destructive"
                              });
                              if (confirmed) {
                                deleteSkillVersion.mutate({ skillId: editingSkill.id, versionId: currentVer.id });
                              }
                            }}
                          >
                            <Trash2 size={14} /> Delete
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="editor-section">
                      <textarea
                        className="admin-textarea monospace"
                        style={{ minHeight: "260px" }}
                        value={editPromptText}
                        onChange={(e) => setEditPromptText(e.target.value)}
                        disabled={!isAdmin || !currentVer}
                      />
                    </div>



                    <div className="editor-section mt-6 border-t pt-6">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                          Context Assembly Configuration
                        </h3>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!isAdmin || !currentVer}
                          onClick={() => setIsContextConfigOpen(true)}
                        >
                          Configure Context...
                        </Button>
                      </div>
                      
                      <div className="p-4 bg-secondary/5 rounded-xl border border-border flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-sm font-medium text-foreground block">
                            {describeInputSourceMap(editInputSourceMap)}
                          </span>
                          <span className="text-xs text-muted-foreground block">
                            Select database tables and other skill histories to feed into this agent version.
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="editor-section mt-6 border-t pt-6">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                          Output Schema Configuration
                        </h3>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!isAdmin || !currentVer}
                          onClick={() => setIsOutputSchemaConfigOpen(true)}
                        >
                          Configure Output...
                        </Button>
                      </div>
                      
                      <div className="p-4 bg-secondary/5 rounded-xl border border-border flex items-center justify-between">
                        <div className="space-y-1">
                          <span className="text-sm font-medium text-foreground block">
                            {describeOutputSchema(editOutputSchema)}
                          </span>
                          <span className="text-xs text-muted-foreground block">
                            Define strict structure boundaries for the AI's response.
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="editor-section mt-4">
                      <p className="form-help">
                        Save Selected Version updates the current system prompt and input configurations. Save as New Version creates a separate version from your changes.
                      </p>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* Skill Create Modal */}
      {isCreateSkillOpen && createPortal(
        <div className="admin-drawer-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsCreateSkillOpen(false);
            setNewSkillInputSourceMap({ skills: [], tables: {} });
            setSkillCreateError(null);
            setIsCreateContextConfigOpen(false);
          }
        }}>
          <div className="admin-drawer-content">
            <div className="admin-drawer-header">
              <h2>Create New Agent Skill</h2>
              <Button variant="ghost" onClick={() => {
                setIsCreateSkillOpen(false);
                setNewSkillInputSourceMap({ skills: [], tables: {} });
                setSkillCreateError(null);
                setIsCreateContextConfigOpen(false);
              }}>
                Close
              </Button>
            </div>

            <div className="admin-drawer-body">
              {skillCreateError && (
                <p className="form-message mb-4" role="alert">{skillCreateError}</p>
              )}
              <div className="space-y-4">
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

                <div className="flex items-center gap-3">
                  <label className="admin-field-label mb-0">KB Injection Eligible</label>
                  <input
                    type="checkbox"
                    checked={newSkillKbEligible}
                    onChange={(e) => setNewSkillKbEligible(e.target.checked)}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground">Enable knowledge base injection for this skill</span>
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

                <div className="editor-section mt-6 border-t pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                      Context Assembly Configuration
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsCreateContextConfigOpen(true)}
                    >
                      Configure Context...
                    </Button>
                  </div>
                  
                  <div className="p-4 bg-secondary/5 rounded-xl border border-border flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-sm font-medium text-foreground block">
                        {describeInputSourceMap(newSkillInputSourceMap)}
                      </span>
                      <span className="text-xs text-muted-foreground block">
                        Select database tables and other skill histories to feed into this agent version.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="editor-section mt-6 border-t pt-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                      Output Schema Configuration
                    </h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsCreateOutputSchemaConfigOpen(true)}
                    >
                      Configure Output...
                    </Button>
                  </div>
                  
                  <div className="p-4 bg-secondary/5 rounded-xl border border-border flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-sm font-medium text-foreground block">
                        {describeOutputSchema(newSkillOutputSchema)}
                      </span>
                      <span className="text-xs text-muted-foreground block">
                        Define strict structure boundaries for the AI's response.
                      </span>
                    </div>
                  </div>
                </div>

                <div className="form-actions pt-4">
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
                        systemPrompt: newSkillPrompt,
                        inputSourceMap: newSkillInputSourceMap,
                        kbEligible: newSkillKbEligible,
                      });
                    }}
                    disabled={createSkillMutation.isPending}
                  >
                    {createSkillMutation.isPending ? "Creating..." : "Create Skill"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isContextConfigOpen && editingSkill && createPortal(
        <div className="admin-config-modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setIsContextConfigOpen(false);
        }}>
          <div className="admin-config-modal-content">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Configure Context Assembly</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Select database tables and skill conversation histories to include in the initial prompt context.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsContextConfigOpen(false)}>Close</Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-secondary/5">
              {/* Skills selection */}
              <div className="border border-border rounded-xl p-4 bg-card h-fit">
                <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                  <span>Previous skill Output</span>
                </h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Select if the previous skill's output should be passed as input context. Can be combined with tables.
                </p>
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                  <label className="flex items-center gap-2 text-sm p-1.5 rounded cursor-pointer hover:bg-secondary/10">
                    <input
                      type="checkbox"
                      checked={editInputSourceMap?.skills?.includes("@previous") || false}
                      onChange={(e) => {
                        const skills = [...(editInputSourceMap?.skills || [])].filter(s => s !== "@previous");
                        if (e.target.checked) skills.push("@previous");
                        setEditInputSourceMap({ ...editInputSourceMap, skills });
                      }}
                      className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-medium text-foreground">Previous skill Output</span>
                      <span className="text-xs text-muted-foreground block font-mono">Include output of the previous skill as input context</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Project Tables & Columns selection */}
              <div className="border border-border rounded-xl p-4 bg-card h-fit">
                <h4 className="text-sm font-semibold mb-1">Project Database Tables</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Select database tables and optionally check specific columns to include in the context.
                </p>
                <div className="flex items-center gap-2 mb-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={
                        Object.keys(filteredDbSchema).length > 0 &&
                        Object.keys(filteredDbSchema).every(tableName => tableName in (editInputSourceMap?.tables || {}))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          const tables: Record<string, string[]> = {};
                          Object.keys(filteredDbSchema).forEach(tableName => {
                            tables[tableName] = [];
                          });
                          setEditInputSourceMap({ ...editInputSourceMap, tables });
                        } else {
                          setEditInputSourceMap({ ...editInputSourceMap, tables: {} });
                        }
                      }}
                      className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                    />
                    <span>Select All Tables</span>
                  </label>
                </div>
                <div className="flex flex-col gap-4 max-h-96 overflow-y-auto pr-1">
                  {Object.entries(filteredDbSchema).map(([tableName, columns]) => {
                    const selectedCols = editInputSourceMap?.tables?.[tableName] || [];
                    const isTableSelected = tableName in (editInputSourceMap?.tables || {});

                    return (
                      <div key={tableName} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                        <label className="flex items-center gap-2 text-sm font-medium p-1 rounded text-foreground cursor-pointer hover:bg-secondary/10">
                          <input
                            type="checkbox"
                            checked={isTableSelected}
                            onChange={(e) => {
                              const tables = { ...(editInputSourceMap?.tables || {}) };
                              if (e.target.checked) {
                                tables[tableName] = [];
                              } else {
                                delete tables[tableName];
                              }
                              setEditInputSourceMap({ ...editInputSourceMap, tables });
                            }}
                            className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                          />
                          <span>{tableName}</span>
                        </label>

                        {isTableSelected && (
                          <div className="pl-6 pt-2 flex flex-col gap-2 bg-secondary/5 p-2 rounded mt-1 border border-dashed border-border/60">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                              Columns (empty = all columns)
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              {columns.map((col) => {
                                const isColChecked = selectedCols.includes(col);
                                return (
                                  <label key={col} className="flex items-center gap-2 text-xs p-1 rounded text-foreground cursor-pointer hover:bg-secondary/20">
                                    <input
                                      type="checkbox"
                                      checked={isColChecked}
                                      onChange={(e) => {
                                        const tables = { ...(editInputSourceMap?.tables || {}) };
                                        let cols = [...(tables[tableName] || [])];
                                        if (e.target.checked) {
                                          cols.push(col);
                                        } else {
                                          cols = cols.filter((c) => c !== col);
                                        }
                                        tables[tableName] = cols;
                                        setEditInputSourceMap({ ...editInputSourceMap, tables });
                                      }}
                                      className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                                    />
                                    <span className="font-mono">{col}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end bg-secondary/5">
              <Button onClick={() => setIsContextConfigOpen(false)}>Done</Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isCreateContextConfigOpen && createPortal(
        <div className="admin-config-modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setIsCreateContextConfigOpen(false);
        }}>
          <div className="admin-config-modal-content">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Configure Context Assembly</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Select database tables and skill conversation histories to include in the initial prompt context.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsCreateContextConfigOpen(false)}>Close</Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-secondary/5">
              {/* Skills selection */}
              <div className="border border-border rounded-xl p-4 bg-card h-fit">
                <h4 className="text-sm font-semibold mb-1 flex items-center gap-2">
                  <span>Previous skill Output</span>
                </h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Select if the previous skill's output should be passed as input context. Can be combined with tables.
                </p>
                <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                  <label className="flex items-center gap-2 text-sm p-1.5 rounded cursor-pointer hover:bg-secondary/10">
                    <input
                      type="checkbox"
                      checked={newSkillInputSourceMap?.skills?.includes("@previous") || false}
                      onChange={(e) => {
                        const skills = [...(newSkillInputSourceMap?.skills || [])].filter(s => s !== "@previous");
                        if (e.target.checked) skills.push("@previous");
                        setNewSkillInputSourceMap({ ...newSkillInputSourceMap, skills });
                      }}
                      className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                    />
                    <div>
                      <span className="font-medium text-foreground">Previous skill Output</span>
                      <span className="text-xs text-muted-foreground block font-mono">Include output of the previous skill as input context</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Project Tables & Columns selection */}
              <div className="border border-border rounded-xl p-4 bg-card h-fit">
                <h4 className="text-sm font-semibold mb-1">Project Database Tables</h4>
                <p className="text-xs text-muted-foreground mb-4">
                  Select database tables and optionally check specific columns to include in the context.
                </p>
                <div className="flex items-center gap-2 mb-3">
                  <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={
                        Object.keys(filteredDbSchema).length > 0 &&
                        Object.keys(filteredDbSchema).every(tableName => newSkillInputSourceMap?.tables && tableName in newSkillInputSourceMap.tables)
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          const tables: Record<string, string[]> = {};
                          Object.keys(filteredDbSchema).forEach(tableName => {
                            tables[tableName] = [];
                          });
                          setNewSkillInputSourceMap({ ...newSkillInputSourceMap, tables });
                        } else {
                          setNewSkillInputSourceMap({ ...newSkillInputSourceMap, tables: {} });
                        }
                      }}
                      className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                    />
                    <span>Select All Tables</span>
                  </label>
                </div>
                <div className="flex flex-col gap-4 max-h-96 overflow-y-auto pr-1">
                  {Object.entries(filteredDbSchema).map(([tableName, columns]) => {
                    const isTableSelected = newSkillInputSourceMap?.tables && tableName in newSkillInputSourceMap.tables;
                    const selectedCols = newSkillInputSourceMap?.tables?.[tableName] || [];

                    return (
                      <div key={tableName} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                        <label className="flex items-center gap-2 text-sm font-medium p-1 rounded text-foreground cursor-pointer hover:bg-secondary/10">
                          <input
                            type="checkbox"
                            checked={isTableSelected}
                            onChange={(e) => {
                              const tables = { ...(newSkillInputSourceMap?.tables || {}) };
                              if (e.target.checked) {
                                tables[tableName] = [];
                              } else {
                                delete tables[tableName];
                              }
                              setNewSkillInputSourceMap({ ...newSkillInputSourceMap, tables });
                            }}
                            className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                          />
                          <span>{tableName}</span>
                        </label>

                        {isTableSelected && (
                          <div className="pl-6 pt-2 flex flex-col gap-2 bg-secondary/5 p-2 rounded mt-1 border border-dashed border-border/60">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                              Columns (empty = all columns)
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              {columns.map((col) => {
                                const isColChecked = selectedCols.includes(col);
                                return (
                                  <label key={col} className="flex items-center gap-2 text-xs p-1 rounded text-foreground cursor-pointer hover:bg-secondary/20">
                                    <input
                                      type="checkbox"
                                      checked={isColChecked}
                                      onChange={(e) => {
                                        const tables = { ...(newSkillInputSourceMap?.tables || {}) };
                                        let cols = [...(tables[tableName] || [])];
                                        if (e.target.checked) {
                                          cols.push(col);
                                        } else {
                                          cols = cols.filter((c) => c !== col);
                                        }
                                        tables[tableName] = cols;
                                        setNewSkillInputSourceMap({ ...newSkillInputSourceMap, tables });
                                      }}
                                      className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                                    />
                                    <span className="font-mono">{col}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-border flex justify-end bg-secondary/5">
              <Button onClick={() => setIsCreateContextConfigOpen(false)}>Done</Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {isOutputSchemaConfigOpen && editingSkill && createPortal(
        <div className="admin-config-modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setIsOutputSchemaConfigOpen(false);
        }}>
          <div className="admin-config-modal-content" style={{ maxWidth: "800px" }}>
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Configure Output Schema</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Define strict structure boundaries for the AI's response.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsOutputSchemaConfigOpen(false)}>Close</Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-secondary/5 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { id: "text", title: "Text (Prompt Instructions)", desc: "Free-form text format instructions" },
                  { id: "table", title: "Database Table", desc: "Select an existing Prisma table schema" },
                  { id: "custom", title: "Custom Schema", desc: "Provide manual JSON schema structure" }
                ].map(opt => (
                  <div 
                    key={opt.id}
                    onClick={() => setEditOutputSchema({ type: opt.id as any, value: editOutputSchema?.type === opt.id ? editOutputSchema.value : "" })}
                    className={`border rounded-xl p-4 cursor-pointer transition-colors ${
                      editOutputSchema?.type === opt.id 
                        ? "border-emerald-500 bg-emerald-500/5" 
                        : "border-border bg-card hover:bg-secondary/10"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        editOutputSchema?.type === opt.id ? "border-emerald-500" : "border-muted-foreground/30"
                      }`}>
                        {editOutputSchema?.type === opt.id && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                      </div>
                      <span className="font-semibold text-sm text-foreground">{opt.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">{opt.desc}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-6">
                {editOutputSchema?.type === "text" && (
                  <div>
                    <label className="admin-field-label">Format Instructions</label>
                    <textarea
                      className="admin-textarea monospace"
                      style={{ minHeight: "150px" }}
                      placeholder="e.g. Return a markdown list of items..."
                      value={editOutputSchema.value}
                      onChange={(e) => setEditOutputSchema({ ...editOutputSchema, value: e.target.value })}
                    />
                  </div>
                )}
                {editOutputSchema?.type === "table" && (() => {
                  const valObj = typeof editOutputSchema.value === "object" && editOutputSchema.value !== null
                    ? editOutputSchema.value
                    : {}; // fallback object
                  
                  return (
                    <div className="border border-border rounded-xl p-4 bg-card flex flex-col space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Select Output Tables</h4>
                        <p className="text-xs text-muted-foreground mb-3">
                          Choose one or more target database tables and their optional columns for the AI's output.
                        </p>
                        
                        <div className="flex flex-col gap-4 max-h-96 overflow-y-auto pr-1">
                          {Object.entries(filteredDbSchema).map(([tableName, columns]) => {
                            const isTableSelected = tableName in valObj;
                            const selectedCols = valObj[tableName] || [];

                            return (
                              <div key={tableName} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                                <label className={`flex items-center gap-2 text-sm font-medium p-1 rounded cursor-pointer transition-colors ${
                                  isTableSelected ? 'text-emerald-600' : 'text-foreground hover:bg-secondary/10'
                                }`}>
                                  <input
                                    type="checkbox"
                                    checked={isTableSelected}
                                    onChange={(e) => {
                                      const tables = { ...valObj };
                                      if (e.target.checked) tables[tableName] = [];
                                      else delete tables[tableName];
                                      setEditOutputSchema({ ...editOutputSchema, value: tables });
                                    }}
                                    className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                                  />
                                  <span>{tableName}</span>
                                </label>

                                {isTableSelected && (
                                  <div className="pl-6 pt-2 flex flex-col gap-2 bg-secondary/5 p-2 rounded mt-1 border border-dashed border-border/60">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                                      Columns (empty = all columns)
                                    </span>
                                    <div className="grid grid-cols-2 gap-2">
                                      {columns.map(col => {
                                        const isColChecked = selectedCols.includes(col);
                                        return (
                                          <label 
                                            key={col} 
                                            className="flex items-center gap-2 text-xs p-1 rounded text-foreground cursor-pointer hover:bg-secondary/20"
                                          >
                                            <input 
                                              type="checkbox" 
                                              checked={isColChecked}
                                              onChange={(e) => {
                                                const tables = { ...valObj };
                                                let cols = [...(tables[tableName] || [])];
                                                if (e.target.checked) cols.push(col);
                                                else cols = cols.filter(c => c !== col);
                                                tables[tableName] = cols;
                                                setEditOutputSchema({ ...editOutputSchema, value: tables });
                                              }}
                                              className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                                            />
                                            <span className="font-mono">{col}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {editOutputSchema?.type === "custom" && (
                  <div className="flex flex-col flex-1 min-h-[300px]">
                    <div className="flex justify-between items-center mb-2">
                      <label className="admin-field-label mb-0">Custom JSON Schema</label>
                      <span className="text-xs text-muted-foreground bg-secondary/20 px-2 py-0.5 rounded">JSON Code Editor</span>
                    </div>
                    <div className="flex-1 border border-border rounded-lg overflow-hidden">
                      <Editor
                        height="300px"
                        defaultLanguage="json"
                        theme="vs-dark"
                        value={typeof editOutputSchema.value === "string" ? editOutputSchema.value : JSON.stringify(editOutputSchema.value || {}, null, 2)}
                        onChange={(val) => setEditOutputSchema({ ...editOutputSchema, value: val || "" })}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 13,
                          tabSize: 2,
                          wordWrap: "on",
                          formatOnPaste: true,
                          scrollBeyondLastLine: false,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end bg-secondary/5">
              <Button onClick={() => setIsOutputSchemaConfigOpen(false)}>Done</Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isCreateOutputSchemaConfigOpen && createPortal(
        <div className="admin-config-modal-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) setIsCreateOutputSchemaConfigOpen(false);
        }}>
          <div className="admin-config-modal-content" style={{ maxWidth: "800px" }}>
            <div className="flex items-center justify-between p-6 border-b border-border">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Configure Output Schema</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Define strict structure boundaries for the AI's response.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setIsCreateOutputSchemaConfigOpen(false)}>Close</Button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-secondary/5 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { id: "text", title: "Text (Prompt Instructions)", desc: "Free-form text format instructions" },
                  { id: "table", title: "Database Table", desc: "Select an existing Prisma table schema" },
                  { id: "custom", title: "Custom Schema", desc: "Provide manual JSON schema structure" }
                ].map(opt => (
                  <div 
                    key={opt.id}
                    onClick={() => setNewSkillOutputSchema({ type: opt.id as any, value: newSkillOutputSchema?.type === opt.id ? newSkillOutputSchema.value : "" })}
                    className={`border rounded-xl p-4 cursor-pointer transition-colors ${
                      newSkillOutputSchema?.type === opt.id 
                        ? "border-emerald-500 bg-emerald-500/5" 
                        : "border-border bg-card hover:bg-secondary/10"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                        newSkillOutputSchema?.type === opt.id ? "border-emerald-500" : "border-muted-foreground/30"
                      }`}>
                        {newSkillOutputSchema?.type === opt.id && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
                      </div>
                      <span className="font-semibold text-sm text-foreground">{opt.title}</span>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">{opt.desc}</p>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-6">
                {newSkillOutputSchema?.type === "text" && (
                  <div>
                    <label className="admin-field-label">Format Instructions</label>
                    <textarea
                      className="admin-textarea monospace"
                      style={{ minHeight: "150px" }}
                      placeholder="e.g. Return a markdown list of items..."
                      value={newSkillOutputSchema.value}
                      onChange={(e) => setNewSkillOutputSchema({ ...newSkillOutputSchema, value: e.target.value })}
                    />
                  </div>
                )}
                {newSkillOutputSchema?.type === "table" && (() => {
                  const valObj = typeof newSkillOutputSchema.value === "object" && newSkillOutputSchema.value !== null
                    ? newSkillOutputSchema.value
                    : {}; // fallback object
                  
                  return (
                    <div className="border border-border rounded-xl p-4 bg-card flex flex-col space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold mb-1">Select Output Tables</h4>
                        <p className="text-xs text-muted-foreground mb-3">
                          Choose one or more target database tables and their optional columns for the AI's output.
                        </p>
                        
                        <div className="flex flex-col gap-4 max-h-96 overflow-y-auto pr-1">
                          {Object.entries(filteredDbSchema).map(([tableName, columns]) => {
                            const isTableSelected = tableName in valObj;
                            const selectedCols = valObj[tableName] || [];

                            return (
                              <div key={tableName} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                                <label className={`flex items-center gap-2 text-sm font-medium p-1 rounded cursor-pointer transition-colors ${
                                  isTableSelected ? 'text-emerald-600' : 'text-foreground hover:bg-secondary/10'
                                }`}>
                                  <input
                                    type="checkbox"
                                    checked={isTableSelected}
                                    onChange={(e) => {
                                      const tables = { ...valObj };
                                      if (e.target.checked) tables[tableName] = [];
                                      else delete tables[tableName];
                                      setNewSkillOutputSchema({ ...newSkillOutputSchema, value: tables });
                                    }}
                                    className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                                  />
                                  <span>{tableName}</span>
                                </label>

                                {isTableSelected && (
                                  <div className="pl-6 pt-2 flex flex-col gap-2 bg-secondary/5 p-2 rounded mt-1 border border-dashed border-border/60">
                                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                                      Columns (empty = all columns)
                                    </span>
                                    <div className="grid grid-cols-2 gap-2">
                                      {columns.map(col => {
                                        const isColChecked = selectedCols.includes(col);
                                        return (
                                          <label 
                                            key={col} 
                                            className="flex items-center gap-2 text-xs p-1 rounded text-foreground cursor-pointer hover:bg-secondary/20"
                                          >
                                            <input 
                                              type="checkbox" 
                                              checked={isColChecked}
                                              onChange={(e) => {
                                                const tables = { ...valObj };
                                                let cols = [...(tables[tableName] || [])];
                                                if (e.target.checked) cols.push(col);
                                                else cols = cols.filter(c => c !== col);
                                                tables[tableName] = cols;
                                                setNewSkillOutputSchema({ ...newSkillOutputSchema, value: tables });
                                              }}
                                              className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                                            />
                                            <span className="font-mono">{col}</span>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {newSkillOutputSchema?.type === "custom" && (
                  <div className="flex flex-col flex-1 min-h-[300px]">
                    <div className="flex justify-between items-center mb-2">
                      <label className="admin-field-label mb-0">Custom JSON Schema</label>
                      <span className="text-xs text-muted-foreground bg-secondary/20 px-2 py-0.5 rounded">JSON Code Editor</span>
                    </div>
                    <div className="flex-1 border border-border rounded-lg overflow-hidden">
                      <Editor
                        height="300px"
                        defaultLanguage="json"
                        theme="vs-dark"
                        value={typeof newSkillOutputSchema.value === "string" ? newSkillOutputSchema.value : JSON.stringify(newSkillOutputSchema.value || {}, null, 2)}
                        onChange={(val) => setNewSkillOutputSchema({ ...newSkillOutputSchema, value: val || "" })}
                        options={{
                          minimap: { enabled: false },
                          fontSize: 13,
                          tabSize: 2,
                          wordWrap: "on",
                          formatOnPaste: true,
                          scrollBeyondLastLine: false,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end bg-secondary/5">
              <Button onClick={() => setIsCreateOutputSchemaConfigOpen(false)}>Done</Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </Page>
  );
}

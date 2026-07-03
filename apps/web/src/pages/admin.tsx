import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MODEL_TIERS, jsonSchemaToTableConfig } from "@remorra/contracts";
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
import { AdminCosts, AdminHealthScoreWeights } from "./admin/admin-costs";
import { AdminContextAutomation } from "./admin/admin-context";
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
    // flow-issues.md #1 — preserve the real skill-ID list as saved. Previously
    // this collapsed any non-empty list down to the literal "@previous",
    // silently discarding which skills were actually selected.
    const rawSkills = Array.isArray(val.skills) ? val.skills : [];
    const skills = rawSkills.filter((s: unknown) => typeof s === "string" && s !== "@previous");
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
    parts.push(`Skills: ${skills.join(", ")}`);
  }
  if (tables.length > 0) {
    parts.push(`Tables: ${tables.join(", ")}`);
  }
  if (parts.length > 0) {
    return `Dynamic context: ${parts.join(" | ")}`;
  }
  return "";
}

const ALL_ACTIONS = ["create", "update", "delete"] as const;

function normalizeTableEntry(entry: any): { columns: string[]; actions: string[] } {
  if (Array.isArray(entry)) return { columns: entry, actions: [...ALL_ACTIONS] };
  if (entry && typeof entry === "object" && "columns" in entry) return { columns: entry.columns ?? [], actions: entry.actions ?? [...ALL_ACTIONS] };
  return { columns: [], actions: [...ALL_ACTIONS] };
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
  const result = { type: val.type || "text", value: val.value ?? "" };
  if (result.type === "table" && typeof result.value === "object" && result.value !== null) {
    // Stored value is the generated JSON schema (properties.operations...) —
    // reconstruct the per-entity column/action map the config UI edits,
    // rather than treating the schema itself as the entity map.
    const fromSchema = jsonSchemaToTableConfig(result.value);
    const rawMap = fromSchema ?? (result.value as Record<string, any>);
    const migrated: Record<string, { columns: string[]; actions: string[] }> = {};
    for (const [k, v] of Object.entries(rawMap)) {
      migrated[k] = normalizeTableEntry(v);
    }
    result.value = migrated;
  }
  return result;
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

// flow-issues.md #1 — is this skill ever actually triggered as a "next skill"
// by an active event mapping? If not, any "previous skill output" sources
// selected on it are speculative — nothing guarantees they'll be populated
// when this skill runs, since nothing is confirmed to run before it.
// Advisory only (non-blocking) — the model already gets <skill_done/> and,
// when Output Schema is configured, the exact <output_data> format appended
// automatically by appendInternalInstructions() at runtime. Hand-writing the
// same instructions in the System Prompt sends them to the model twice and
// can drift out of sync with the real config.
function detectFormatDuplicationWarnings(prompt: string): string[] {
  const warnings: string[] = [];
  if (!prompt) return warnings;
  if (/<skill_done\s*\/?>/i.test(prompt)) {
    warnings.push(`Mentions "<skill_done/>" — this tag is always appended automatically. Remove it from the prompt.`);
  }
  if (/<output_data>|<\/output_data>/i.test(prompt)) {
    warnings.push(`Mentions "<output_data>" tags — these are auto-injected from the Output Schema config below. Describing them here duplicates that instruction.`);
  }
  if (/```json|"operations"\s*:\s*\[/i.test(prompt)) {
    warnings.push(`Contains a hand-written JSON example — if Output Schema is configured, the exact format is already auto-appended; a hand-written example here can drift out of sync and conflict with it.`);
  }
  return warnings;
}

function findTriggeringMapping(skillId: string, mappings: any[]): any | null {
  return mappings.find((m: any) => m.skillId === skillId && m.active) ?? null;
}

// Human-readable description of what actually triggers a skill's "previous
// skill output" baseline right now — resolved against both skill-completed-event
// mappings and db-event mappings, so the admin can see exactly what this skill's
// default input will be without any extra sources configured.
function describeTriggerMapping(mapping: any | null, allSkills: any[]): string {
  if (!mapping) {
    return "Nothing currently triggers this skill via an active event mapping — the baseline previous-skill-output will be empty until one is configured.";
  }
  const completedMatch = String(mapping.eventType ?? "").match(/^skill\.(.+)\.completed$/);
  if (completedMatch) {
    const sourceSkill = allSkills.find((s: any) => s.id === completedMatch[1]);
    return `Triggered when skill "${sourceSkill?.name ?? completedMatch[1]}" completes — that skill's output is this skill's default input.`;
  }
  return `Triggered by database event "${mapping.eventType}" — no skill output feeds this skill by default; only the database event's own data is available.`;
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
  const [editingKbId, setEditingKbId] = useState<string | null>(null);
  const [editingKbVersionId, setEditingKbVersionId] = useState<string | null>(null);
  const [editKbDraft, setEditKbDraft] = useState("");

  // KB create form state
  const [isCreateKbOpen, setIsCreateKbOpen] = useState(false);
  const [newKbId, setNewKbId] = useState("");
  const [newKbName, setNewKbName] = useState("");
  const [newKbDesc, setNewKbDesc] = useState("");
  const [newKbMarkdown, setNewKbMarkdown] = useState("");

  // Skill Creation States
  const [isCreateSkillOpen, setIsCreateSkillOpen] = useState(false);
  const [newSkillId, setNewSkillId] = useState("");
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [newSkillPrompt, setNewSkillPrompt] = useState("");
  const [newSkillKbEligible, setNewSkillKbEligible] = useState(false);
  const [newSkillPhase, setNewSkillPhase] = useState("discover");
  const [newSkillModelTier, setNewSkillModelTier] = useState("standard");
  const [newSkillInputSourceMap, setNewSkillInputSourceMap] = useState<any>({ skills: [], tables: {} });
  const [createUseOtherSkillOutput, setCreateUseOtherSkillOutput] = useState(false);
  const [newSkillOutputSchema, setNewSkillOutputSchema] = useState<any>({ type: "text", value: "" });
  const [newSkillCustomSchemaError, setNewSkillCustomSchemaError] = useState<string | null>(null);
  const [skillCreateError, setSkillCreateError] = useState<string | null>(null);
  const [isCreateContextConfigOpen, setIsCreateContextConfigOpen] = useState(false);
  const [isCreateOutputSchemaConfigOpen, setIsCreateOutputSchemaConfigOpen] = useState(false);

  const [editingSkill, setEditingSkill] = useState<any | null>(null);
  const [editingSkillVersionId, setEditingSkillVersionId] = useState<string | null>(null);
  const [editPromptText, setEditPromptText] = useState("");
  const [editSkillName, setEditSkillName] = useState("");
  const [editSkillDesc, setEditSkillDesc] = useState("");
  const [editKbEligible, setEditKbEligible] = useState(false);
  const [editSkillPhase, setEditSkillPhase] = useState("discover");
  const [editSkillModelTier, setEditSkillModelTier] = useState("standard");
  const [editInputSourceMap, setEditInputSourceMap] = useState<any>({ skills: [], tables: {} });
  const [editUseOtherSkillOutput, setEditUseOtherSkillOutput] = useState(false);
  const [editOutputSchema, setEditOutputSchema] = useState<any>({ type: "text", value: "" });
  const [editCustomSchemaError, setEditCustomSchemaError] = useState<string | null>(null);
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
        goals: [{ id: "goal-1", title: "Carbon Neutrality", detail: "Reduce workspace operational carbon output by 20%." }],
        personas: [{ id: "per-1", name: "Auditor Alice", description: "Agronomy carbon checker.", linkedStories: [{ id: "story-1", statement: "Clean linkage reports" }], painPoints: [{ id: "pp-1", statement: "Stale data reports lead to audit delays." }] }]
      }, null, 2));
    } else if (template.id === "health-score") {
      setSampleJsonText(JSON.stringify({
        projectName: "Greenfield Analytics",
        overallScore: 78,
        readinessAssessment: "Solid foundation — minor refinement needed.",
        components: [
          { component: "problem_top", weight: 15, score: 85, rationale: "Goals are specific and measurable.", actions: ["Add a third measurable Goal."] },
        ],
      }, null, 2));
    } else if (template.id === "build-pack") {
      setSampleJsonText(JSON.stringify({
        projectName: "Greenfield Analytics",
        buildPhaseName: "Core Product Build",
        buildPhaseDescription: "MVP scope for the initial release.",
        stories: [
          {
            id: "story-1",
            title: "Set low-stock threshold per product",
            description: "As a shop owner, I want to set a low-stock threshold so I can act before running out.",
            status: "ready",
            priority: "high",
            acceptance: [{ given: "a product is tracked", when: "quantity crosses threshold", then: "owner sees an alert" }],
            epicTitle: "Low-stock alerts",
            goalTitle: "Help shop owners manage stock proactively",
            personaNames: ["Local shop owner Maria"],
          },
        ],
        risks: [{ title: "Barcode hardware may not be available", type: "Risk", severity: "medium", status: "open" }],
      }, null, 2));
    } else if (template.id === "build-sync-instructions") {
      setSampleJsonText(JSON.stringify({ buildPhaseId: "00000000-0000-0000-0000-000000000000" }, null, 2));
    } else {
      setSampleJsonText(JSON.stringify({
        title: "Sample Report",
        generatedAt: new Date().toISOString(),
        summary: "Generic placeholder for report-definition-driven templates — actual shape comes from the report's own outputSchema.",
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

  // flow-issues.md #1 — used to warn when a skill's "previous skill output"
  // sources are configured but no event mapping actually triggers this skill
  // after anything, so those sources would be empty at runtime.
  const { data: allMappingsData } = useQuery<any>({
    queryKey: ["admin-all-event-mappings"],
    queryFn: () => api("/admin/event-mappings?page=1&limit=200"),
    enabled: activeTab === "system",
  });
  const allMappings = allMappingsData?.items ?? [];

  const { data: dbSchemaData = { tables: {}, relations: {} } } = useQuery<{ tables: Record<string, string[]>; relations: Record<string, { column: string; referencedTable: string }[]> }>({
    queryKey: ["admin-db-schema"],
    queryFn: () => api("/admin/db-schema"),
    enabled: activeTab === "system",
  });

  const ALLOWED_TABLES = ["Project", "Goal", "Epic", "Story", "Persona", "PainPoint", "RaidItem"];
  const ALWAYS_SENSITIVE = ["id", "projectId", "createdAt", "updatedAt", "embedding", "version", "position"];
  // FK columns pointing to tables NOT in ALLOWED_TABLES are system-managed (e.g. ownerId→Profile, cycleId→Cycle)
  const systemFkCols = new Set<string>(
    Object.values(dbSchemaData.relations).flat()
      .filter(fk => !ALLOWED_TABLES.includes(fk.referencedTable))
      .map(fk => fk.column)
  );
  const isSensitive = (col: string) => ALWAYS_SENSITIVE.includes(col) || systemFkCols.has(col);
  const filteredDbSchema = Object.fromEntries(
    Object.entries(dbSchemaData.tables)
      .filter(([tableName]) => ALLOWED_TABLES.includes(tableName))
      .map(([tableName, cols]) => [tableName, (cols as string[]).filter(c => !isSensitive(c))])
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
  const editingKb = editingKbId ? (knowledge as any[]).find((kb: any) => kb.id === editingKbId) ?? null : null;

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

  const { data: healthScoreWeights = [], isLoading: loadingHealthScoreWeights } = useQuery<any[]>({
    queryKey: ["admin-health-score-weights"],
    queryFn: () => api("/admin/health-score-weights"),
    enabled: activeTab === "costs",
  });
  const [healthScoreWeightDrafts, setHealthScoreWeightDrafts] = useState<Record<string, number>>({});

  const updateHealthScoreWeight = useMutation({
    mutationFn: ({ component, weight }: { component: string; weight: number }) =>
      api(`/admin/health-score-weights/${component}`, {
        method: "PUT",
        body: JSON.stringify({ weight }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-health-score-weights"] });
      toast.success("Health Score weight updated successfully!");
    },
  });

  const { data: contextAutoCaptureRules = [], isLoading: loadingContextRules } = useQuery<any[]>({
    queryKey: ["admin-context-auto-capture-rules"],
    queryFn: () => api("/admin/context-auto-capture-rules"),
    enabled: activeTab === "costs",
  });

  const { data: contextReviewConfig } = useQuery<any>({
    queryKey: ["admin-context-review-config"],
    queryFn: () => api("/admin/context-review-config"),
    enabled: activeTab === "costs",
  });

  const createContextRule = useMutation({
    mutationFn: (data: { pattern: string; entityTypes: string[]; contextText: string; minOccurrences: number }) =>
      api("/admin/context-auto-capture-rules", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-context-auto-capture-rules"] });
      toast.success("Auto-capture rule added.");
    },
    onError: (err: any) => toast.error(err?.message || "Failed to add rule."),
  });

  const updateContextRule = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api(`/admin/context-auto-capture-rules/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["admin-context-auto-capture-rules"] }),
    onError: (err: any) => toast.error(err?.message || "Failed to update rule."),
  });

  const deleteContextRule = useMutation({
    mutationFn: (id: string) => api(`/admin/context-auto-capture-rules/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-context-auto-capture-rules"] });
      toast.success("Rule deleted.");
    },
    onError: (err: any) => toast.error(err?.message || "Failed to delete rule."),
  });

  const updateContextReviewConfig = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api(`/admin/context-review-config/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-context-review-config"] });
      toast.success("Review schedule updated.");
    },
    onError: (err: any) => toast.error(err?.message || "Failed to update schedule."),
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
    mutationFn: ({ skillId, systemPrompt, inputSourceMap, outputSchema, name, description, kbEligible, phase, modelTier }: { skillId: string; systemPrompt: string; inputSourceMap?: any; outputSchema?: any; name?: string; description?: string; kbEligible?: boolean; phase?: string; modelTier?: string }) =>
      api(`/admin/skills/${skillId}/versions`, {
        method: "POST",
        body: JSON.stringify({ systemPrompt, inputSourceMap, outputSchema, name, description, kbEligible, phase, modelTier }),
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
    mutationFn: ({ skillId, versionId, systemPrompt, inputSourceMap, outputSchema, name, description, kbEligible, phase, modelTier }: { skillId: string; versionId: string; systemPrompt: string; inputSourceMap?: any; outputSchema?: any; name?: string; description?: string; kbEligible?: boolean; phase?: string; modelTier?: string }) =>
      api(`/admin/skills/${skillId}/versions/${versionId}`, {
        method: "PATCH",
        body: JSON.stringify({ systemPrompt, inputSourceMap, outputSchema, name, description, kbEligible, phase, modelTier }),
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
        if (nextVersions.length === 0) return null;
        return { ...current, versions: nextVersions };
      });
      setEditingSkillVersionId((cur: string | null) => (cur === variables.versionId ? null : cur));
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
    mutationFn: (data: { id: string; name: string; description: string; systemPrompt: string; inputSourceMap?: any; outputSchema?: any; kbEligible?: boolean; phase?: string; modelTier?: string }) =>
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
      setNewSkillPhase("discover");
      setNewSkillModelTier("standard");
      setNewSkillInputSourceMap({ skills: [], tables: {} });
      setCreateUseOtherSkillOutput(false);
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
      setNewKbId(""); setNewKbName(""); setNewKbDesc(""); setNewKbMarkdown("");
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

  const activateKbVersion = useMutation({
    mutationFn: ({ kbId, versionId }: { kbId: string; versionId: string }) =>
      api(`/admin/knowledge-bases/${kbId}/versions/${versionId}/activate`, { method: "POST" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-knowledge"] });
      toast.success("Version activated!");
    },
    onError: (err: any) => toast.error(err.message || "Failed to activate version."),
  });

  const embedKbMutation = useMutation({
    mutationFn: (kbId: string) =>
      api(`/admin/knowledge-bases/${kbId}/embed`, { method: "POST" }),
    onSuccess: () => toast.success("Embedding generated!"),
    onError: (err: any) => toast.error(err.message || "Failed to generate embedding."),
  });

  const deleteKbMutation = useMutation({
    mutationFn: (kbId: string) =>
      api(`/admin/knowledge-bases/${kbId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-knowledge"] });
      setEditingKbId(null);
      toast.success("Knowledge base deleted.");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete knowledge base."),
  });

  const deleteKbVersionMutation = useMutation({
    mutationFn: ({ kbId, versionId }: { kbId: string; versionId: string }) =>
      api(`/admin/knowledge-bases/${kbId}/versions/${versionId}`, { method: "DELETE" }),
    onSuccess: (_, { versionId }) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-knowledge"] });
      setEditingKbVersionId((cur: string | null) => (cur === versionId ? null : cur));
      toast.success("Version deleted.");
    },
    onError: (err: any) => toast.error(err.message || "Failed to delete version."),
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
        <>
          <AdminCosts
            configs={costConfigs}
            drafts={costDrafts}
            isAdmin={isAdmin}
            setDrafts={setCostDrafts}
            onSave={(key, data) => updateCostConfig.mutate({ key, data })}
            isLoading={loadingCosts}
          />
          <AdminHealthScoreWeights
            weights={healthScoreWeights}
            drafts={healthScoreWeightDrafts}
            isAdmin={isAdmin}
            setDrafts={setHealthScoreWeightDrafts}
            onSave={(component, weight) => updateHealthScoreWeight.mutate({ component, weight })}
            isLoading={loadingHealthScoreWeights}
          />
          <AdminContextAutomation
            rules={contextAutoCaptureRules}
            reviewConfig={contextReviewConfig}
            isAdmin={isAdmin}
            isLoading={loadingContextRules}
            onCreateRule={(data) => createContextRule.mutate(data)}
            onUpdateRule={(id, data) => updateContextRule.mutate({ id, data })}
            onDeleteRule={(id) => deleteContextRule.mutate(id)}
            onUpdateReviewConfig={(id, data) => updateContextReviewConfig.mutate({ id, data })}
          />
        </>
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
                  setEditSkillPhase(skill.phase ?? "discover");
                  setEditSkillModelTier(currentVer?.modelTier ?? "standard");
                  const parsedInputSourceMap = parseInputSourceMap(currentVer?.inputSourceMap);
                  setEditInputSourceMap(parsedInputSourceMap);
                  setEditUseOtherSkillOutput((parsedInputSourceMap?.skills?.length ?? 0) > 0);
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
                isAdmin={isAdmin}
                onEdit={(kb) => {
                  const activeVer = kb.versions.find((v: any) => v.active) ?? kb.versions[0];
                  setEditingKbId(kb.id);
                  setEditingKbVersionId(activeVer?.id ?? null);
                  setEditKbDraft(activeVer?.markdown ?? "");
                }}
                onDelete={async (kb) => {
                  const confirmed = await confirm({ title: "Delete Knowledge Base", description: `Delete "${kb.name}"? Removes all versions and topic mappings.`, confirmText: "Delete", variant: "destructive" });
                  if (confirmed) deleteKbMutation.mutate(kb.id);
                }}
                isLoading={loadingKnowledge}
                isCreateOpen={isCreateKbOpen}
                onOpenCreate={() => setIsCreateKbOpen(true)}
                onCloseCreate={() => { setIsCreateKbOpen(false); setNewKbId(""); setNewKbName(""); setNewKbDesc(""); setNewKbMarkdown(""); }}
                newKbId={newKbId} onNewKbId={setNewKbId}
                newKbName={newKbName} onNewKbName={setNewKbName}
                newKbDesc={newKbDesc} onNewKbDesc={setNewKbDesc}
newKbMarkdown={newKbMarkdown} onNewKbMarkdown={setNewKbMarkdown}
                onCreateSubmit={() => createKnowledgeMutation.mutate({ id: newKbId, name: newKbName, description: newKbDesc, markdown: newKbMarkdown })}
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
          setEditSkillModelTier(version.modelTier ?? "standard");
          const selectedInputSourceMap = parseInputSourceMap(version.inputSourceMap);
          setEditInputSourceMap(selectedInputSourceMap);
          setEditUseOtherSkillOutput((selectedInputSourceMap?.skills?.length ?? 0) > 0);
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
                            phase: editSkillPhase,
                            modelTier: editSkillModelTier,
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
                            phase: editSkillPhase,
                            modelTier: editSkillModelTier,
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
                  <div>
                    <label className="admin-field-label">DRIVE Phase</label>
                    <select
                      className="admin-input"
                      value={editSkillPhase}
                      onChange={(e) => setEditSkillPhase(e.target.value)}
                      disabled={!isAdmin || !currentVer}
                    >
                      <option value="discover">Discover</option>
                      <option value="refine">Refine</option>
                      <option value="initiate">Initiate</option>
                      <option value="venture">Venture</option>
                      <option value="evolve">Evolve</option>
                    </select>
                  </div>
                  <div>
                    <label className="admin-field-label">Model Tier</label>
                    <select
                      className="admin-input"
                      value={editSkillModelTier}
                      onChange={(e) => setEditSkillModelTier(e.target.value)}
                      disabled={!isAdmin || !currentVer}
                    >
                      {MODEL_TIERS.map((tier) => (
                        <option key={tier} value={tier}>{tier}</option>
                      ))}
                    </select>
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
                      {detectFormatDuplicationWarnings(editPromptText).map((warning, i) => (
                        <div key={i} className="mt-2 rounded-lg border border-warning/30 bg-warning-soft/30 p-2 text-[11px] text-warning">
                          {warning}
                        </div>
                      ))}
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

      {/* KB Edit Drawer */}
      {editingKb && (() => {
        const activeVer = editingKb.versions.find((v: any) => v.active);
        const currentVer = editingKb.versions.find((v: any) => v.id === editingKbVersionId) ?? activeVer ?? editingKb.versions[0];
        const selectKbVersion = (ver: any) => {
          setEditingKbVersionId(ver.id);
          setEditKbDraft(ver.markdown ?? "");
        };
        return createPortal(
          <div className="admin-drawer-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditingKbId(null); }}>
            <div className="admin-drawer-content">
              <div className="admin-drawer-header">
                <div>
                  <h2>Manage Knowledge Base: {editingKb.name}</h2>
                  <code>{editingKb.id}</code>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <Button variant="outline" size="sm" disabled={embedKbMutation.isPending}
                      onClick={() => embedKbMutation.mutate(editingKb.id)}>
                      {embedKbMutation.isPending ? "Embedding..." : "Re-embed"}
                    </Button>
                  )}
                  {isAdmin && (
                    <Button variant="destructive" size="sm" disabled={deleteKbMutation.isPending}
                      onClick={async () => {
                        const confirmed = await confirm({ title: "Delete Knowledge Base", description: `Delete "${editingKb.name}"? This removes all versions and topic mappings.`, confirmText: "Delete", variant: "destructive" });
                        if (confirmed) deleteKbMutation.mutate(editingKb.id);
                      }}>
                      <Trash2 size={14} /> Delete KB
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setEditingKbId(null)}>Close</Button>
                </div>
              </div>
              <div className="admin-drawer-body">
                <div className="skill-version-manager">
                  <aside className="skill-version-list">
                    <div className="flex items-center h-8 mb-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        Active: {activeVer ? <Badge tone="green">v{activeVer.version}</Badge> : <Badge tone="amber">None</Badge>}
                      </span>
                    </div>
                    {[...(editingKb.versions ?? [])].sort((a: any, b: any) => b.version - a.version).map((ver: any) => (
                      <div key={ver.id} className={`skill-version-item ${currentVer?.id === ver.id ? "active" : ""}`}
                        style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <button type="button" style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                          onClick={() => selectKbVersion(ver)}>
                          <span>v{ver.version}</span>
                          <div>{ver.active ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Draft</Badge>}</div>
                        </button>
                        {isAdmin && !ver.active && (
                          <Button variant="ghost" size="icon" style={{ flexShrink: 0, width: 24, height: 24 }}
                            onClick={async (e) => {
                              e.stopPropagation();
                              const confirmed = await confirm({ title: "Delete version", description: `Delete v${ver.version}? This cannot be undone.`, confirmText: "Delete", variant: "destructive" });
                              if (confirmed) deleteKbVersionMutation.mutate({ kbId: editingKb.id, versionId: ver.id });
                            }}>
                            <Trash2 size={12} />
                          </Button>
                        )}
                      </div>
                    ))}
                  </aside>
                  <section className="skill-version-editor">
                    <div className="flex justify-between items-center h-8 mb-2">
                      <label className="text-sm font-medium text-muted-foreground">Markdown Content</label>
                      {currentVer && !currentVer.active && isAdmin && (
                        <Button variant="secondary" size="sm" onClick={() => activateKbVersion.mutate({ kbId: editingKb.id, versionId: currentVer.id })}>
                          <CheckCircle2 size={14} /> Activate
                        </Button>
                      )}
                    </div>
                    <textarea
                      className="admin-textarea monospace w-full"
                      value={currentVer?.active || !editingKbVersionId ? editKbDraft : currentVer?.markdown ?? ""}
                      onChange={(e) => { if (currentVer?.active || !editingKbVersionId) setEditKbDraft(e.target.value); }}
                      disabled={!isAdmin || (!!currentVer && !currentVer.active && !!editingKbVersionId)}
                      rows={20}
                    />
                    {isAdmin && (currentVer?.active || !editingKbVersionId) && (
                      <div className="flex justify-end mt-4">
                        <Button onClick={() => createKnowledgeVersion.mutate({ id: editingKb.id, markdown: editKbDraft })}>
                          Save as New Version
                        </Button>
                      </div>
                    )}
                  </section>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        );
      })()}

      {/* Skill Create Modal */}
      {isCreateSkillOpen && createPortal(
        <div className="admin-drawer-overlay" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setIsCreateSkillOpen(false);
            setNewSkillInputSourceMap({ skills: [], tables: {} });
            setCreateUseOtherSkillOutput(false);
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
                setCreateUseOtherSkillOutput(false);
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
                  <label className="admin-field-label">DRIVE Phase</label>
                  <select
                    className="admin-input"
                    value={newSkillPhase}
                    onChange={(e) => setNewSkillPhase(e.target.value)}
                  >
                    <option value="discover">Discover</option>
                    <option value="refine">Refine</option>
                    <option value="initiate">Initiate</option>
                    <option value="venture">Venture</option>
                    <option value="evolve">Evolve</option>
                  </select>
                </div>

                <div>
                  <label className="admin-field-label">Model Tier</label>
                  <select
                    className="admin-input"
                    value={newSkillModelTier}
                    onChange={(e) => setNewSkillModelTier(e.target.value)}
                  >
                    {MODEL_TIERS.map((tier) => (
                      <option key={tier} value={tier}>{tier}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="admin-field-label">Initial System Prompt</label>
                  <textarea
                    placeholder="You are an expert agent that..."
                    className="admin-textarea monospace"
                    value={newSkillPrompt}
                    onChange={(e) => setNewSkillPrompt(e.target.value)}
                  />
                  {detectFormatDuplicationWarnings(newSkillPrompt).map((warning, i) => (
                    <div key={i} className="mt-2 rounded-lg border border-warning/30 bg-warning-soft/30 p-2 text-[11px] text-warning">
                      {warning}
                    </div>
                  ))}
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
                        outputSchema: newSkillOutputSchema,
                        kbEligible: newSkillKbEligible,
                        phase: newSkillPhase,
                        modelTier: newSkillModelTier,
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
                  <span>Skill Output Sources</span>
                </h4>
                <p className="text-xs text-muted-foreground mb-3">
                  By default, this skill's input is always whichever skill actually triggers it — no configuration needed.
                </p>
                <label className="flex items-center gap-2 text-sm p-1.5 mb-2 rounded cursor-pointer hover:bg-secondary/10 font-medium">
                  <input
                    type="checkbox"
                    checked={editUseOtherSkillOutput}
                    onChange={(e) => {
                      setEditUseOtherSkillOutput(e.target.checked);
                      if (!e.target.checked) {
                        setEditInputSourceMap({ ...editInputSourceMap, skills: [] });
                      }
                    }}
                    className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Also use other skill output</span>
                </label>

                {editUseOtherSkillOutput ? (
                  <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1 pl-1 border-l-2 border-border ml-1 mt-2">
                    {allSkills.filter((s: any) => s.id !== editingSkill?.id).map((s: any) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm p-1.5 rounded cursor-pointer hover:bg-secondary/10">
                        <input
                          type="checkbox"
                          checked={editInputSourceMap?.skills?.includes(s.id) || false}
                          onChange={(e) => {
                            const skills = [...(editInputSourceMap?.skills || [])].filter((id: string) => id !== s.id);
                            if (e.target.checked) skills.push(s.id);
                            setEditInputSourceMap({ ...editInputSourceMap, skills });
                          }}
                          className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                        />
                        <div>
                          <span className="font-medium text-foreground">{s.name ?? s.id}</span>
                          <span className="text-xs text-muted-foreground block font-mono">{s.id}</span>
                        </div>
                      </label>
                    ))}
                    {allSkills.length <= 1 ? (
                      <p className="text-xs text-muted-foreground p-1.5">No other skills exist yet to select as a source.</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-1 rounded-lg border border-warning/30 bg-warning-soft/30 p-2 text-[11px] text-warning">
                    This skill's input is always the previous (triggering) skill's output.{" "}
                    {editingSkill ? describeTriggerMapping(findTriggeringMapping(editingSkill.id, allMappings), allSkills) : ""}
                  </div>
                )}
              </div>

              {/* Project Tables & Columns selection */}
              <div className="border border-border rounded-xl p-4 bg-card h-fit">
                <h4 className="text-sm font-semibold mb-1">Project Database Tables</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Select database tables and optionally check specific columns to include in the context.
                </p>
                <div className="mt-1 mb-4 rounded-lg border border-primary/20 bg-primary-soft/10 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground block mb-1">DRIVE Simplified Hierarchy Links:</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-foreground">Goal</span>
                    <span>➜</span>
                    <span className="font-semibold text-foreground">Epic</span> <span className="text-[10px] text-muted-foreground">(linked via goalId)</span>
                    <span>➜</span>
                    <span className="font-semibold text-foreground">Story</span> <span className="text-[10px] text-muted-foreground">(linked via epicId)</span>
                    <span>➜</span>
                    <span className="font-semibold text-foreground">Persona</span> <span className="text-[10px] text-muted-foreground">(linked via PersonaStory)</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground block mt-1.5">
                    * Foreign key connections and linked Persona associations are automatically sent to the LLM when these tables are included.
                  </span>
                </div>
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
                  <span>Skill Output Sources</span>
                </h4>
                <p className="text-xs text-muted-foreground mb-3">
                  By default, this skill's input is always whichever skill actually triggers it — no configuration needed.
                </p>
                <label className="flex items-center gap-2 text-sm p-1.5 mb-2 rounded cursor-pointer hover:bg-secondary/10 font-medium">
                  <input
                    type="checkbox"
                    checked={createUseOtherSkillOutput}
                    onChange={(e) => {
                      setCreateUseOtherSkillOutput(e.target.checked);
                      if (!e.target.checked) {
                        setNewSkillInputSourceMap({ ...newSkillInputSourceMap, skills: [] });
                      }
                    }}
                    className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                  />
                  <span>Also use other skill output</span>
                </label>

                {createUseOtherSkillOutput ? (
                  <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1 pl-1 border-l-2 border-border ml-1 mt-2">
                    {allSkills.map((s: any) => (
                      <label key={s.id} className="flex items-center gap-2 text-sm p-1.5 rounded cursor-pointer hover:bg-secondary/10">
                        <input
                          type="checkbox"
                          checked={newSkillInputSourceMap?.skills?.includes(s.id) || false}
                          onChange={(e) => {
                            const skills = [...(newSkillInputSourceMap?.skills || [])].filter((id: string) => id !== s.id);
                            if (e.target.checked) skills.push(s.id);
                            setNewSkillInputSourceMap({ ...newSkillInputSourceMap, skills });
                          }}
                          className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                        />
                        <div>
                          <span className="font-medium text-foreground">{s.name ?? s.id}</span>
                          <span className="text-xs text-muted-foreground block font-mono">{s.id}</span>
                        </div>
                      </label>
                    ))}
                    {allSkills.length === 0 ? (
                      <p className="text-xs text-muted-foreground p-1.5">No other skills exist yet to select as a source.</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-1 rounded-lg border border-warning/30 bg-warning-soft/30 p-2 text-[11px] text-warning">
                    This skill's input is always the previous (triggering) skill's output. Once created, wire an Event
                    Mapping so something actually triggers it — otherwise this baseline will be empty at runtime.
                  </div>
                )}
              </div>

              {/* Project Tables & Columns selection */}
              <div className="border border-border rounded-xl p-4 bg-card h-fit">
                <h4 className="text-sm font-semibold mb-1">Project Database Tables</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Select database tables and optionally check specific columns to include in the context.
                </p>
                <div className="mt-1 mb-4 rounded-lg border border-primary/20 bg-primary-soft/10 p-2.5 text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground block mb-1">DRIVE Simplified Hierarchy Links:</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-foreground">Goal</span>
                    <span>➜</span>
                    <span className="font-semibold text-foreground">Epic</span> <span className="text-[10px] text-muted-foreground">(linked via goalId)</span>
                    <span>➜</span>
                    <span className="font-semibold text-foreground">Story</span> <span className="text-[10px] text-muted-foreground">(linked via epicId)</span>
                    <span>➜</span>
                    <span className="font-semibold text-foreground">Persona</span> <span className="text-[10px] text-muted-foreground">(linked via PersonaStory)</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground block mt-1.5">
                    * Foreign key connections and linked Persona associations are automatically sent to the LLM when these tables are included.
                  </span>
                </div>
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
                  const valObj: Record<string, { columns: string[]; actions: string[] }> = typeof editOutputSchema.value === "object" && editOutputSchema.value !== null ? editOutputSchema.value : {};
                  return (
                    <div className="border border-border rounded-xl p-4 bg-card flex flex-col space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold">Select Output Tables</h4>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer text-emerald-600 font-medium">
                            <input type="checkbox"
                              checked={Object.keys(filteredDbSchema).length > 0 && Object.keys(filteredDbSchema).every(t => t in valObj)}
                              onChange={(e) => {
                                const tables: Record<string, { columns: string[]; actions: string[] }> = {};
                                if (e.target.checked) Object.entries(filteredDbSchema).forEach(([t, cols]) => { tables[t] = { columns: [...cols], actions: [...ALL_ACTIONS] }; });
                                setEditOutputSchema({ ...editOutputSchema, value: tables });
                              }}
                              className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                            />
                            Select all tables
                          </label>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">Choose tables, columns, and allowed actions. LLM decides values and action per operation.</p>
                        <div className="flex flex-col gap-4 max-h-96 overflow-y-auto pr-1">
                          {Object.entries(filteredDbSchema).map(([tableName, columns]) => {
                            const isTableSelected = tableName in valObj;
                            const entry = normalizeTableEntry(valObj[tableName]);
                            return (
                              <div key={tableName} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                                <label className={`flex items-center gap-2 text-sm font-medium p-1 rounded cursor-pointer transition-colors ${isTableSelected ? 'text-emerald-600' : 'text-foreground hover:bg-secondary/10'}`}>
                                  <input type="checkbox" checked={isTableSelected}
                                    onChange={(e) => {
                                      const tables = { ...valObj };
                                      if (e.target.checked) tables[tableName] = { columns: [], actions: [...ALL_ACTIONS] };
                                      else delete tables[tableName];
                                      setEditOutputSchema({ ...editOutputSchema, value: tables });
                                    }}
                                    className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                                  />
                                  <span>{tableName}</span>
                                </label>
                                {isTableSelected && (
                                  <div className="pl-6 pt-2 flex flex-col gap-3 bg-secondary/5 p-2 rounded mt-1 border border-dashed border-border/60">
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Columns</span>
                                        <label className="flex items-center gap-1 text-xs cursor-pointer text-emerald-600">
                                          <input type="checkbox" checked={entry.columns.length === columns.length}
                                            onChange={(e) => {
                                              const tables = { ...valObj };
                                              const cur = normalizeTableEntry(tables[tableName]);
                                              tables[tableName] = { ...cur, columns: e.target.checked ? [...columns] : [] };
                                              setEditOutputSchema({ ...editOutputSchema, value: tables });
                                            }}
                                            className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                                          />
                                          Select all
                                        </label>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        {columns.map(col => (
                                          <label key={col} className="flex items-center gap-2 text-xs p-1 rounded text-foreground cursor-pointer hover:bg-secondary/20">
                                            <input type="checkbox" checked={entry.columns.includes(col)}
                                              onChange={(e) => {
                                                const tables = { ...valObj };
                                                const cur = normalizeTableEntry(tables[tableName]);
                                                tables[tableName] = { ...cur, columns: e.target.checked ? [...cur.columns, col] : cur.columns.filter(c => c !== col) };
                                                setEditOutputSchema({ ...editOutputSchema, value: tables });
                                              }}
                                              className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                                            />
                                            <span className="font-mono">{col}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Allowed Actions</span>
                                      <div className="flex gap-3">
                                        {ALL_ACTIONS.map(action => (
                                          <label key={action} className="flex items-center gap-1.5 text-xs cursor-pointer">
                                            <input type="checkbox" checked={entry.actions.includes(action)}
                                              onChange={(e) => {
                                                const tables = { ...valObj };
                                                const cur = normalizeTableEntry(tables[tableName]);
                                                tables[tableName] = { ...cur, actions: e.target.checked ? [...cur.actions, action] : cur.actions.filter(a => a !== action) };
                                                setEditOutputSchema({ ...editOutputSchema, value: tables });
                                              }}
                                              className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                                            />
                                            <span className={`font-mono capitalize ${action === 'delete' ? 'text-red-500' : action === 'create' ? 'text-emerald-600' : 'text-blue-500'}`}>{action}</span>
                                          </label>
                                        ))}
                                      </div>
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
                      <span className="text-xs text-muted-foreground bg-secondary/20 px-2 py-0.5 rounded">JSON Editor</span>
                    </div>
                    <div className="flex-1 border border-border rounded-lg overflow-hidden">
                      <Editor
                        height="300px"
                        defaultLanguage="json"
                        theme="vs-dark"
                        value={typeof editOutputSchema.value === "string" ? editOutputSchema.value : JSON.stringify(editOutputSchema.value || {}, null, 2)}
                        onChange={(val) => { setEditOutputSchema({ ...editOutputSchema, value: val || "" }); setEditCustomSchemaError(null); }}
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
                    {editCustomSchemaError && (
                      <p className="text-xs text-destructive mt-1">{editCustomSchemaError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end bg-secondary/5">
              <Button onClick={() => {
                if (editOutputSchema?.type === "custom" && typeof editOutputSchema.value === "string" && editOutputSchema.value.trim()) {
                  try { JSON.parse(editOutputSchema.value); } catch (e: any) {
                    setEditCustomSchemaError(`Invalid JSON: ${e.message}`);
                    return;
                  }
                }
                setEditCustomSchemaError(null);
                setIsOutputSchemaConfigOpen(false);
              }}>Done</Button>
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
                  const valObj: Record<string, { columns: string[]; actions: string[] }> = typeof newSkillOutputSchema.value === "object" && newSkillOutputSchema.value !== null ? newSkillOutputSchema.value : {};
                  return (
                    <div className="border border-border rounded-xl p-4 bg-card flex flex-col space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-semibold">Select Output Tables</h4>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer text-emerald-600 font-medium">
                            <input type="checkbox"
                              checked={Object.keys(filteredDbSchema).length > 0 && Object.keys(filteredDbSchema).every(t => t in valObj)}
                              onChange={(e) => {
                                const tables: Record<string, { columns: string[]; actions: string[] }> = {};
                                if (e.target.checked) Object.entries(filteredDbSchema).forEach(([t, cols]) => { tables[t] = { columns: [...cols], actions: [...ALL_ACTIONS] }; });
                                setNewSkillOutputSchema({ ...newSkillOutputSchema, value: tables });
                              }}
                              className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                            />
                            Select all tables
                          </label>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">Choose tables, columns, and allowed actions. LLM decides values and action per operation.</p>
                        <div className="flex flex-col gap-4 max-h-96 overflow-y-auto pr-1">
                          {Object.entries(filteredDbSchema).map(([tableName, columns]) => {
                            const isTableSelected = tableName in valObj;
                            const entry = normalizeTableEntry(valObj[tableName]);
                            return (
                              <div key={tableName} className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                                <label className={`flex items-center gap-2 text-sm font-medium p-1 rounded cursor-pointer transition-colors ${isTableSelected ? 'text-emerald-600' : 'text-foreground hover:bg-secondary/10'}`}>
                                  <input type="checkbox" checked={isTableSelected}
                                    onChange={(e) => {
                                      const tables = { ...valObj };
                                      if (e.target.checked) tables[tableName] = { columns: [], actions: [...ALL_ACTIONS] };
                                      else delete tables[tableName];
                                      setNewSkillOutputSchema({ ...newSkillOutputSchema, value: tables });
                                    }}
                                    className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                                  />
                                  <span>{tableName}</span>
                                </label>
                                {isTableSelected && (
                                  <div className="pl-6 pt-2 flex flex-col gap-3 bg-secondary/5 p-2 rounded mt-1 border border-dashed border-border/60">
                                    <div>
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Columns</span>
                                        <label className="flex items-center gap-1 text-xs cursor-pointer text-emerald-600">
                                          <input type="checkbox" checked={entry.columns.length === columns.length}
                                            onChange={(e) => {
                                              const tables = { ...valObj };
                                              const cur = normalizeTableEntry(tables[tableName]);
                                              tables[tableName] = { ...cur, columns: e.target.checked ? [...columns] : [] };
                                              setNewSkillOutputSchema({ ...newSkillOutputSchema, value: tables });
                                            }}
                                            className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                                          />
                                          Select all
                                        </label>
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        {columns.map(col => (
                                          <label key={col} className="flex items-center gap-2 text-xs p-1 rounded text-foreground cursor-pointer hover:bg-secondary/20">
                                            <input type="checkbox" checked={entry.columns.includes(col)}
                                              onChange={(e) => {
                                                const tables = { ...valObj };
                                                const cur = normalizeTableEntry(tables[tableName]);
                                                tables[tableName] = { ...cur, columns: e.target.checked ? [...cur.columns, col] : cur.columns.filter(c => c !== col) };
                                                setNewSkillOutputSchema({ ...newSkillOutputSchema, value: tables });
                                              }}
                                              className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                                            />
                                            <span className="font-mono">{col}</span>
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Allowed Actions</span>
                                      <div className="flex gap-3">
                                        {ALL_ACTIONS.map(action => (
                                          <label key={action} className="flex items-center gap-1.5 text-xs cursor-pointer">
                                            <input type="checkbox" checked={entry.actions.includes(action)}
                                              onChange={(e) => {
                                                const tables = { ...valObj };
                                                const cur = normalizeTableEntry(tables[tableName]);
                                                tables[tableName] = { ...cur, actions: e.target.checked ? [...cur.actions, action] : cur.actions.filter(a => a !== action) };
                                                setNewSkillOutputSchema({ ...newSkillOutputSchema, value: tables });
                                              }}
                                              className="rounded border-input text-emerald-500 focus:ring-emerald-500 scale-90"
                                            />
                                            <span className={`font-mono capitalize ${action === 'delete' ? 'text-red-500' : action === 'create' ? 'text-emerald-600' : 'text-blue-500'}`}>{action}</span>
                                          </label>
                                        ))}
                                      </div>
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
                      <span className="text-xs text-muted-foreground bg-secondary/20 px-2 py-0.5 rounded">JSON Editor</span>
                    </div>
                    <div className="flex-1 border border-border rounded-lg overflow-hidden">
                      <Editor
                        height="300px"
                        defaultLanguage="json"
                        theme="vs-dark"
                        value={typeof newSkillOutputSchema.value === "string" ? newSkillOutputSchema.value : JSON.stringify(newSkillOutputSchema.value || {}, null, 2)}
                        onChange={(val) => { setNewSkillOutputSchema({ ...newSkillOutputSchema, value: val || "" }); setNewSkillCustomSchemaError(null); }}
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
                    {newSkillCustomSchemaError && (
                      <p className="text-xs text-destructive mt-1">{newSkillCustomSchemaError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-end bg-secondary/5">
              <Button onClick={() => {
                if (newSkillOutputSchema?.type === "custom" && typeof newSkillOutputSchema.value === "string" && newSkillOutputSchema.value.trim()) {
                  try { JSON.parse(newSkillOutputSchema.value); } catch (e: any) {
                    setNewSkillCustomSchemaError(`Invalid JSON: ${e.message}`);
                    return;
                  }
                }
                setNewSkillCustomSchemaError(null);
                setIsCreateOutputSchemaConfigOpen(false);
              }}>Done</Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </Page>
  );
}

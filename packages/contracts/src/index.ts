import { z } from "zod";

export const drivePhaseSchema = z.enum([
  "discover",
  "refine",
  "initiate",
  "venture",
  "evolve",
]);
export type DrivePhase = z.infer<typeof drivePhaseSchema>;

export const projectRoleSchema = z.enum(["founder", "team"]);
export type ProjectRole = z.infer<typeof projectRoleSchema>;

export const modelTierSchema = z.enum(["fast", "standard", "reasoning"]);
export type ModelTier = z.infer<typeof modelTierSchema>;
export const MODEL_TIERS = modelTierSchema.options;

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(120),
  phase: drivePhaseSchema,
  role: projectRoleSchema,
  version: z.number().int().positive(),
  healthScore: z.number().min(0).max(100).nullable(),
  updatedAt: z.iso.datetime(),
});
export type Project = z.infer<typeof projectSchema>;

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  summary: z.string().trim().max(500).optional(),
});
export type CreateProject = z.infer<typeof createProjectSchema>;

export const buildPhaseStatusSchema = z.enum(["draft", "ready", "active", "closed"]);

export const createBuildPhaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
});

export const updateBuildPhaseSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  status: buildPhaseStatusSchema.optional(),
});

export const assignBuildPhaseStoriesSchema = z.object({
  storyIds: z.array(z.string().uuid()).min(1),
});

export const sessionModeSchema = z.enum(["ideate", "publish"]);
export const sessionStatusSchema = z.enum([
  "active",
  "draft",
  "screening",
  "completed",
  "nav_away",
]);

export const createEvolveSessionSchema = z.object({
  launchedFrom: z.string().trim().min(1).max(160),
  topic: z.string().trim().min(3).max(180).optional(),
});

export const updateEvolveSessionStatusSchema = z.object({
  status: z.enum(["draft", "completed", "nav_away"]),
});

export const proposalStatusSchema = z.enum(["pending", "confirmed", "rejected"]);
export type ProposalStatusValue = z.infer<typeof proposalStatusSchema>;

export const impactItemSchema = z.object({
  id: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid().nullable(),
  severity: z.enum(["red", "amber", "green"]),
  title: z.string(),
  reasoning: z.string(),
  decision: proposalStatusSchema,
});
export type ImpactItem = z.infer<typeof impactItemSchema>;

export const evolveActionSchema = z.object({
  id: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid().nullable(),
  actionType: z.enum(["create", "update", "delete"]),
  proposedChange: z.record(z.string(), z.unknown()),
  requiresScreening: z.boolean(),
  status: proposalStatusSchema,
  rationale: z.string().nullable(),
  createdAt: z.iso.datetime(),
  impactItems: z.array(impactItemSchema),
});
export type EvolveAction = z.infer<typeof evolveActionSchema>;

export const contextProposalSchema = z.object({
  id: z.string().uuid(),
  proposedText: z.string(),
  status: proposalStatusSchema,
  createdAt: z.iso.datetime(),
});
export type ContextProposal = z.infer<typeof contextProposalSchema>;

export const sendEvolveMessageSchema = z.object({
  content: z.string().trim().min(1).max(8000),
});

export const conversationMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.iso.datetime(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const healthScoreComponentSchema = z.object({
  component: z.string(),
  weight: z.number().int().min(0).max(100),
  score: z.number().int().min(0).max(100),
  rationale: z.string(),
  actions: z.array(z.string()),
});

export const healthScoreResultSchema = z.object({
  id: z.string().uuid(),
  overallScore: z.number().int().min(0).max(100),
  readinessAssessment: z.string(),
  calculatedAt: z.iso.datetime(),
  components: z.array(healthScoreComponentSchema),
});
export type HealthScoreResult = z.infer<typeof healthScoreResultSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const platformRoleSchema = z.enum(["user", "admin", "support"]);
export const workStatusSchema = z.enum([
  "ready",
  "in_progress",
  "review",
  "done",
]);
export const prioritySchema = z.enum(["low", "medium", "high", "critical"]);

export const actorSchema = z.object({
  id: z.string().uuid(),
  email: z.email(),
  preferredName: z.string().nullable(),
  platformRole: platformRoleSchema,
  status: z.enum(["active", "deletion_pending", "deleted"]),
});

export const invitationInputSchema = z.object({
  email: z.email(),
  role: z.enum(["team"]),
});

export const createRefineSessionSchema = z.object({
  projectId: z.string().uuid(),
});

export const refineProposalSchema = z.object({
  id: z.string().uuid(),
  entityType: z.enum([
    "ambition",
    "okr",
    "persona",
    "pain_point",
    "user_need",
  ]),
  payload: z.record(z.string(), z.unknown()),
  status: z.enum(["pending", "confirmed", "rejected"]),
});

export const productPackDtoSchema = z.object({
  projectName: z.string(),
  coveragePercent: z.number().int().min(0).max(100),
  linkageValid: z.boolean(),
  passThread: z.boolean(),
  goals: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    detail: z.string(),
    epics: z.array(z.object({
      id: z.string().uuid(),
      title: z.string(),
      storyTitles: z.unknown(),
      personaIds: z.array(z.string().uuid()),
    })),
  })),
  personas: z.array(z.object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string(),
    painPoints: z.array(z.object({ id: z.string().uuid(), statement: z.string() })),
    linkedStories: z.array(z.object({ id: z.string().uuid(), statement: z.string() })),
  })),
  assembledAt: z.iso.datetime(),
});
export type ProductPackDto = z.infer<typeof productPackDtoSchema>;

export const cycleInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  isBuildCycle: z.boolean().default(false),
});

export const storyInputSchema = z.object({
  userNeedId: z.string().uuid(),
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4000).optional(),
  acceptance: z.array(z.string().trim().min(1)).default([]),
  priority: prioritySchema.default("medium"),
  estimatePoints: z.number().int().min(1).max(100).optional(),
});

export const taskInputSchema = z.object({
  storyId: z.string().uuid(),
  cycleId: z.string().uuid().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(2).max(240),
  description: z.string().trim().max(4000).optional(),
  priority: prioritySchema.default("medium"),
  dueAt: z.iso.datetime().nullable().optional(),
});

export const taskMoveSchema = z.object({
  status: workStatusSchema,
  position: z.number().int().min(0),
  version: z.number().int().positive(),
});

export const reportTypeSchema = z.enum([
  "product-health",
  "viability",
  "delivery-progress",
  "risk-dependency",
  "investor-readiness",
]);

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const consentInputSchema = z.object({
  privacyPolicyVersion: z.string().min(1),
  termsVersion: z.string().min(1),
});

export const cursorPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
  });

export const skillVersionInputSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  phase: drivePhaseSchema.optional(),
  kbEligible: z.boolean().optional(),
  systemPrompt: z.string().optional(),
  modelTier: modelTierSchema.optional(),
  inputSourceMap: z.object({
    skills: z.array(z.string()).optional(),
    tables: z.record(z.string(), z.array(z.string())).optional(),
  }).optional(),
  outputSchema: z.object({
    type: z.enum(["table", "custom", "text"]),
    value: z.any()
  }).nullable().optional(),
  constraints: z.array(z.string()).optional(),
  examples: z.unknown().optional(),
  retryPolicy: z.unknown().optional(),
});
export type SkillVersionInput = z.infer<typeof skillVersionInputSchema>;


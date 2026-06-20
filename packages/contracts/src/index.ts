import { z } from "zod";

export const drivePhaseSchema = z.enum([
  "discover",
  "refine",
  "initiate",
  "venture",
  "evolve",
]);
export type DrivePhase = z.infer<typeof drivePhaseSchema>;

export const projectRoleSchema = z.enum(["founder", "team", "supplier"]);
export type ProjectRole = z.infer<typeof projectRoleSchema>;

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(120),
  phase: drivePhaseSchema,
  role: projectRoleSchema,
  version: z.number().int().positive(),
  viabilityScore: z.number().min(0).max(100).nullable(),
  updatedAt: z.iso.datetime(),
});
export type Project = z.infer<typeof projectSchema>;

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  summary: z.string().trim().max(500).optional(),
});
export type CreateProject = z.infer<typeof createProjectSchema>;

export const sessionModeSchema = z.enum(["ideate", "publish"]);
export const sessionStatusSchema = z.enum([
  "active",
  "draft",
  "screening",
  "completed",
]);

export const createEvolveSessionSchema = z.object({
  projectId: z.string().uuid(),
  mode: sessionModeSchema,
  topic: z.string().trim().min(3).max(180),
  launchedFrom: z.string().trim().max(160),
  continuedFromSessionId: z.string().uuid().optional(),
});

export const impactItemSchema = z.object({
  id: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid().nullable(),
  severity: z.enum(["red", "amber", "green"]),
  title: z.string(),
  reasoning: z.string(),
  decision: z.enum(["pending", "approved", "rejected"]),
});
export type ImpactItem = z.infer<typeof impactItemSchema>;

export const conversationMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  createdAt: z.iso.datetime(),
});
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const viabilityResultSchema = z.object({
  overall: z.number().min(0).max(100),
  components: z.record(z.string(), z.number().min(0).max(100)),
  rationale: z.string(),
  actions: z.array(
    z.object({
      priority: z.number().int().positive(),
      title: z.string(),
      targetType: z.string(),
      targetId: z.string().uuid().nullable(),
    }),
  ),
});
export type ViabilityResult = z.infer<typeof viabilityResultSchema>;

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
  role: z.enum(["team", "supplier"]),
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
  systemPrompt: z.string().optional(),
  contextRequirements: z.array(z.string()).optional(),
  inputSourceMap: z.object({
    skills: z.array(z.string()).optional(),
    tables: z.record(z.string(), z.array(z.string())).optional(),
  }).optional(),
  outputSchema: z.unknown().nullable().optional(),
  constraints: z.array(z.string()).optional(),
  examples: z.unknown().optional(),
  retryPolicy: z.unknown().optional(),
});
export type SkillVersionInput = z.infer<typeof skillVersionInputSchema>;


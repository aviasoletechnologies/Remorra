// RemoraDocument §7 Response Router — takes a completed Skill's parsed
// output and decides where the results go: entity update actions become
// pending EvolveAction rows (never written directly — every Evolve write
// needs user confirmation per doc), context updates become ContextProposal
// rows, both awaiting founder/team decision via the Evolve API.
import { prisma } from "../lib/prisma";
import { jsonValue } from "../lib/utils";

export type EvolveOperation = {
  ref?: string;
  action: string;
  entity: string;
  id?: string;
  data: Record<string, unknown>;
};

export type RoutedEvolveAction = {
  actionId: string;
  entityType: string;
  requiresScreening: boolean;
};

// Goal changes require Screening Engine cascade assessment before they can be
// approved (RemoraDocument §7/§9 — Goals are Founder-only, Evolve-screening-only).
// Every other entity still needs confirmation (Action Capability) but has no
// cascade to assess.
const SCREENED_ENTITY_TYPES = new Set(["Goal"]);

export async function routeEntityActions(params: {
  projectId: string;
  evolveSessionId: string;
  operations: EvolveOperation[];
}): Promise<RoutedEvolveAction[]> {
  const created: RoutedEvolveAction[] = [];
  for (const op of params.operations) {
    const entityType = String(op.entity ?? "").trim();
    if (!entityType || !op.data || typeof op.data !== "object") continue;

    const requiresScreening = SCREENED_ENTITY_TYPES.has(entityType);
    const action = await prisma.evolveAction.create({
      data: {
        evolveSessionId: params.evolveSessionId,
        projectId: params.projectId,
        entityType,
        entityId: op.id ?? null,
        actionType: op.action,
        proposedChange: jsonValue(op.data),
        requiresScreening,
      },
    });
    created.push({ actionId: action.id, entityType, requiresScreening });
  }
  return created;
}

export type ImpactItemInput = {
  affectedEntityType: string;
  affectedEntityId?: string | null;
  severity: "red" | "amber" | "green";
  title: string;
  reasoning: string;
  suggestedChange?: unknown;
};

export async function attachImpactItems(evolveActionId: string, items: ImpactItemInput[]) {
  if (items.length === 0) return;
  await prisma.evolveImpactItem.createMany({
    data: items.map((item) => ({
      evolveActionId,
      affectedEntityType: item.affectedEntityType,
      affectedEntityId: item.affectedEntityId ?? null,
      severity: item.severity,
      title: item.title,
      reasoning: item.reasoning,
      suggestedChange: item.suggestedChange !== undefined ? jsonValue(item.suggestedChange) : undefined,
    })),
  });
}

export async function createContextProposal(params: {
  projectId: string;
  evolveSessionId: string;
  proposedText: string;
}) {
  return prisma.contextProposal.create({ data: params });
}

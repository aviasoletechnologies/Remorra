import { prisma } from "./prisma";
import { jsonValue } from "./utils";

export async function logEntityAudit(input: {
  projectId: string;
  actorId: string;
  eventType: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}) {
  try {
    await prisma.auditEvent.create({
      data: {
        projectId: input.projectId,
        actorId: input.actorId,
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        before: input.before !== undefined ? jsonValue(input.before) : undefined,
        after: input.after !== undefined ? jsonValue(input.after) : undefined,
        metadata: { source: "extract_mapper" },
      },
    });
  } catch (err) {
    console.warn("[logEntityAudit] failed to write audit event", err);
  }
}

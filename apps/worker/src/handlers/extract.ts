import { prisma } from "../lib/prisma";
import { decrypt } from "../lib/crypto";
import { jsonValue, parseAndValidateJson } from "../lib/utils";
import { projectContext } from "../assemblers/context";
import { invokeSkill } from "../assemblers/skills";
import type { Payload } from "./conversation";

export async function handleExtract(payload: Payload) {
  const eventType = typeof payload.eventType === "string" ? payload.eventType : undefined;
  if (
    payload.skillId === "viability-score-calculator" ||
    eventType === "viability.calculate"
  ) {
    const projectId = String(payload.projectId);
    const result = await invokeSkill({
      skillId: typeof payload.skillId === "string" ? payload.skillId : undefined,
      eventType,
      userId: String(payload.userId),
      projectId,
      content: "Calculate the current configured viability score.",
      context: await projectContext(projectId),
    });
    const parsed = parseAndValidateJson(
      result.text,
      (result.skill.outputSchema as Record<string, unknown>) ?? {},
    ) as Record<string, unknown>;
    const snapshot = await prisma.viabilitySnapshot.create({
      data: {
        projectId,
        skillVersionId: result.skill.versionId,
        overall: Number(parsed.overall ?? 0),
        components: jsonValue(parsed.components ?? {}),
        rationale: String(parsed.rationale ?? ""),
        actions: jsonValue(parsed.actions ?? []),
        sourceVersion: (
          await prisma.project.findUniqueOrThrow({
            where: { id: projectId },
            select: { version: true },
          })
        ).version,
      },
    });
    return { viabilitySnapshotId: snapshot.id };
  }

  if (
    (payload.skillId === "impact-screener" || eventType === "evolve.screen") &&
    payload.evolveSessionId
  ) {
    const session = await prisma.evolveSession.findUniqueOrThrow({
      where: { id: String(payload.evolveSessionId) },
    });
    const result = await invokeSkill({
      skillId: typeof payload.skillId === "string" ? payload.skillId : undefined,
      eventType,
      userId: String(payload.userId),
      projectId: session.projectId,
      content: `Screen the proposed Evolve topic: ${session.topic}`,
      context: await projectContext(session.projectId),
    });
    const parsed = parseAndValidateJson(
      result.text,
      (result.skill.outputSchema as Record<string, unknown>) ?? {},
    );
    const items = Array.isArray(parsed) ? parsed : [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const value = item as Record<string, unknown>;
      await prisma.impactItem.create({
        data: {
          evolveSessionId: session.id,
          entityType: String(value.entityType ?? "project"),
          entityId: typeof value.entityId === "string" ? value.entityId : null,
          severity: String(value.severity ?? "amber"),
          title: String(value.title ?? "Impact item"),
          reasoning: String(value.reasoning ?? ""),
          proposedChange: jsonValue(value.proposedChange ?? {}),
        },
      });
    }
    return { impactsCreated: items.length };
  }

  const conversationId = String(payload.conversationId ?? "");
  const refineSessionId = String(payload.refineSessionId ?? "");
  const conversation = conversationId
    ? await prisma.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
    : null;
  const session = refineSessionId
    ? await prisma.refineSession.findUniqueOrThrow({
        where: { id: refineSessionId },
      })
    : null;
  const projectId = conversation?.projectId ?? session!.projectId;
  const content = conversation
    ? conversation.messages
        .map((message: any) => `${message.role}: ${decrypt(message.encryptedContent)}`)
        .join("\n")
    : JSON.stringify(await projectContext(projectId));
  const result = await invokeSkill({
    skillId: typeof payload.skillId === "string" ? payload.skillId : undefined,
    eventType,
    userId: String(payload.userId),
    projectId,
    content,
    context: { extractType: payload.extractType ?? "refine-proposals" },
  });
  const parsed = parseAndValidateJson(
    result.text,
    (result.skill.outputSchema as Record<string, unknown>) ?? {},
  );
  if (conversation) {
    await prisma.structuredExtract.create({
      data: { conversationId, schemaVersion: 1, payload: jsonValue(parsed) },
    });
  }
  if (session) {
    const proposals = Array.isArray(parsed) ? parsed : [parsed];
    for (const proposal of proposals) {
      if (!proposal || typeof proposal !== "object") continue;
      const record = proposal as Record<string, unknown>;
      if (!record.entityType || !record.payload) continue;
      await prisma.refineProposal.create({
        data: {
          projectId,
          refineSessionId,
          entityType: String(record.entityType),
          payload: jsonValue(record.payload),
        },
      });
    }
  }
  return { extracted: true };
}

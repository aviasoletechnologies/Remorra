// RemoraDocument §10 — Project Context Automation, Layer 1: pattern-based
// auto-capture (no AI). Rules are founder-configured (RemoraDocument §20:
// "Project context auto-capture rules" must be Configuration, not code) —
// this module contains zero hardcoded patterns, only the matching engine.
import { prisma } from "../lib/prisma";

const TEXT_FIELDS: Record<string, [string, string]> = {
  Goal: ["title", "detail"],
  Epic: ["title", "description"],
  Story: ["title", "description"],
  Persona: ["name", "description"],
  RaidItem: ["title", "description"],
};

export async function runLayer1AutoCapture(projectId: string) {
  const rules = await prisma.contextAutoCaptureRule.findMany({ where: { active: true } });
  if (rules.length === 0) return;

  for (const rule of rules) {
    const entityTypes = rule.entityTypes.filter((type: string) => TEXT_FIELDS[type]);
    if (entityTypes.length === 0) continue;

    let matchCount = 0;
    for (const entityType of entityTypes) {
      const [field1, field2] = TEXT_FIELDS[entityType]!;
      const delegateName = entityType.charAt(0).toLowerCase() + entityType.slice(1);
      const delegate = (prisma as any)[delegateName];
      if (!delegate?.count) continue;

      matchCount += await delegate.count({
        where: {
          projectId,
          OR: [
            { [field1]: { contains: rule.pattern, mode: "insensitive" } },
            { [field2]: { contains: rule.pattern, mode: "insensitive" } },
          ],
        },
      });
    }

    if (matchCount < rule.minOccurrences) continue;

    const existing = await prisma.contextProposal.findFirst({
      where: {
        projectId,
        proposedText: rule.contextText,
        status: { in: ["pending", "confirmed"] },
      },
    });
    if (existing) continue;

    await prisma.contextProposal.create({
      data: {
        projectId,
        proposedText: rule.contextText,
        source: "layer1",
      },
    });
  }
}

export async function runRosterCapture(projectId: string, memberName: string, role: string) {
  await prisma.contextProposal.create({
    data: {
      projectId,
      proposedText: `Team: ${memberName} joined as ${role}.`,
      source: "layer1",
    },
  });
}

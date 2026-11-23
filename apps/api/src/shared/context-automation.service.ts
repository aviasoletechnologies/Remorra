import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infrastructure/prisma.service.js";

// RemoraDocument §10 Layer 1 — pattern-based auto-capture (no AI), API-side
// counterpart to apps/worker/src/services/context-automation.ts for entity
// mutations that happen directly through REST endpoints (Evolve Action
// Capability approvals, direct RaidItem CRUD) rather than through a Skill.
const TEXT_FIELDS: Record<string, [string, string]> = {
  Goal: ["title", "detail"],
  Epic: ["title", "description"],
  Story: ["title", "description"],
  Persona: ["name", "description"],
  RaidItem: ["title", "description"],
};

@Injectable()
export class ContextAutomationService {
  constructor(private readonly prisma: PrismaService) {}

  async runLayer1AutoCapture(projectId: string) {
    const rules = await this.prisma.client.contextAutoCaptureRule.findMany({ where: { active: true } });
    if (rules.length === 0) return;

    for (const rule of rules) {
      const entityTypes = rule.entityTypes.filter((type: string) => TEXT_FIELDS[type]);
      if (entityTypes.length === 0) continue;

      let matchCount = 0;
      for (const entityType of entityTypes) {
        const [field1, field2] = TEXT_FIELDS[entityType]!;
        const delegateName = entityType.charAt(0).toLowerCase() + entityType.slice(1);
        const delegate = (this.prisma.client as any)[delegateName];
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

      const existing = await this.prisma.client.contextProposal.findFirst({
        where: { projectId, proposedText: rule.contextText, status: { in: ["pending", "confirmed"] } },
      });
      if (existing) continue;

      await this.prisma.client.contextProposal.create({
        data: { projectId, proposedText: rule.contextText, source: "layer1" },
      });
    }
  }

  async runRosterCapture(projectId: string, memberName: string, role: string) {
    await this.prisma.client.contextProposal.create({
      data: {
        projectId,
        proposedText: `Team: ${memberName} joined as ${role}.`,
        source: "layer1",
      },
    });
  }
}

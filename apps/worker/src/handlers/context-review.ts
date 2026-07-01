import { prisma } from "../lib/prisma";
import { parseAndValidateJson } from "../lib/utils";
import { invokeSkill } from "../assemblers/skills";

// RemoraDocument §10 Layer 3 — a scheduled Skill (configurable frequency via
// ContextReviewConfig) scans recent Audit Trail entries and new entities per
// project, compares against project.context, and proposes additions or
// corrections. Every proposal still requires founder confirm (no direct write).
export async function handleContextReview() {
  const config = await prisma.contextReviewConfig.findFirst({ where: { active: true } });
  if (!config) return { scanned: 0, proposed: 0 };

  const projects = await prisma.project.findMany({
    select: { id: true, name: true, summary: true, context: true, ownerId: true },
  });

  let proposed = 0;
  for (const project of projects) {
    try {
      const [recentAudits, goalCount, epicCount, storyCount, personaCount] = await Promise.all([
        prisma.auditEvent.findMany({
          where: { projectId: project.id },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { eventType: true, entityType: true, createdAt: true },
        }),
        prisma.goal.count({ where: { projectId: project.id } }),
        prisma.epic.count({ where: { projectId: project.id } }),
        prisma.story.count({ where: { projectId: project.id } }),
        prisma.persona.count({ where: { projectId: project.id } }),
      ]);
      if (recentAudits.length === 0) continue;

      const result = await invokeSkill({
        skillId: "project-context-reviewer",
        userId: project.ownerId,
        projectId: project.id,
        content: "Review recent activity for project-context drift and propose additions or corrections.",
        context: {
          projectName: project.name,
          currentContext: project.context ?? "",
          recentAuditEvents: recentAudits,
          entityCounts: { goals: goalCount, epics: epicCount, stories: storyCount, personas: personaCount },
        },
      });

      const parsed = parseAndValidateJson(
        result.text,
        (result.skill.outputSchema as Record<string, unknown>) ?? {},
      ) as { proposals?: unknown };

      const proposals = Array.isArray(parsed.proposals) ? parsed.proposals : [];
      for (const text of proposals) {
        if (typeof text !== "string" || !text.trim()) continue;
        const existing = await prisma.contextProposal.findFirst({
          where: { projectId: project.id, proposedText: text, status: { in: ["pending", "confirmed"] } },
        });
        if (existing) continue;
        await prisma.contextProposal.create({
          data: { projectId: project.id, proposedText: text, source: "layer3" },
        });
        proposed += 1;
      }
    } catch (err) {
      console.warn(`[context-review] project=${project.id} failed:`, err instanceof Error ? err.message : String(err));
    }
  }

  return { scanned: projects.length, proposed };
}

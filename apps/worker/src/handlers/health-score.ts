import { prisma } from "../lib/prisma";
import { parseAndValidateJson } from "../lib/utils";
import { assembleHealthScoreRawData } from "../assemblers/packs";
import { invokeSkill } from "../assemblers/skills";
import type { Payload } from "./conversation";

// Weights per HARDIK doc Q13 — 15% each for the 6 top/detail components, 10% Cohesion.
const COMPONENT_WEIGHTS: Record<string, number> = {
  problem_top: 15,
  idea_top: 15,
  user_top: 15,
  problem_detail: 15,
  idea_detail: 15,
  user_detail: 15,
  cohesion: 10,
};
const COMPONENT_KEYS = Object.keys(COMPONENT_WEIGHTS);

export async function handleHealthScoreCalculate(payload: Payload) {
  const projectId = String(payload.projectId);
  const userId = String(payload.userId ?? "");

  const rawData = await assembleHealthScoreRawData(projectId);

  const result = await invokeSkill({
    skillId: "health-score-calculator",
    userId,
    projectId,
    content: "Calculate the Health Score for this project from the provided raw signal.",
    context: rawData,
  });

  const parsed = parseAndValidateJson(
    result.text,
    (result.skill.outputSchema as Record<string, unknown>) ?? {},
  ) as {
    readinessAssessment?: string;
    components?: Array<{ component: string; score: number; rationale: string; actions?: unknown }>;
  };

  const components = Array.isArray(parsed.components) ? parsed.components : [];
  const byKey = new Map(components.map((c) => [c.component, c]));
  const missing = COMPONENT_KEYS.filter((key) => !byKey.has(key));
  if (missing.length > 0) {
    throw new Error(
      `Health Score Calculator Skill output is missing required component(s): ${missing.join(", ")}.`,
    );
  }
  if (!parsed.readinessAssessment) {
    throw new Error("Health Score Calculator Skill output is missing readinessAssessment.");
  }

  const weightedSum = COMPONENT_KEYS.reduce((sum, key) => {
    const component = byKey.get(key)!;
    return sum + component.score * COMPONENT_WEIGHTS[key]!;
  }, 0);
  const overallScore = Math.round(weightedSum / 100);

  const healthScore = await prisma.$transaction(async (tx: any) => {
    const created = await tx.healthScore.create({
      data: {
        projectId,
        overallScore,
        readinessAssessment: parsed.readinessAssessment!,
        skillVersionId: result.skill.versionId,
      },
    });
    await tx.healthScoreComponent.createMany({
      data: COMPONENT_KEYS.map((key) => {
        const component = byKey.get(key)!;
        return {
          healthScoreId: created.id,
          component: key,
          weight: COMPONENT_WEIGHTS[key]!,
          score: component.score,
          rationale: component.rationale,
          actions: Array.isArray(component.actions) ? component.actions : [],
        };
      }),
    });
    return created;
  });

  return { healthScoreId: healthScore.id, overallScore };
}

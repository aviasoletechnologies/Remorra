import { prisma } from "../lib/prisma";

// Live entity-summary panel data (Goal -> Epic -> Story chain + Persona/PainPoint).
export async function assembleProductPackData(projectId: string): Promise<any> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  const goals = await prisma.goal.findMany({
    where: { projectId },
    include: { epics: { include: { stories: { include: { personas: true } } } } },
  });
  const personas = await prisma.persona.findMany({
    where: { projectId },
    include: { painPoints: true, stories: { include: { story: true } } },
  });

  const completeThread = goals.some((goal: any) =>
    goal.epics.some((epic: any) =>
      epic.stories.some((story: any) =>
        story.personas.some((link: any) => {
          const persona = personas.find((item: any) => item.id === link.personaId);
          return persona?.painPoints.length;
        }),
      ),
    ),
  );

  const goalScore = goals.length > 0 ? 100 : 0;
  const goalsWithEpics = goals.filter((g: any) => g.epics.length > 0).length;
  const epicScore = goals.length > 0 ? (goalsWithEpics / goals.length) * 100 : 0;

  const personaScore = personas.length > 0 ? 100 : 0;
  const personasWithPainPoints = personas.filter((p: any) => p.painPoints.length > 0).length;
  const painPointScore = personas.length > 0 ? (personasWithPainPoints / personas.length) * 100 : 0;

  const personasWithStories = personas.filter((p: any) => p.stories.length > 0).length;
  const storyLinkScore = personas.length > 0 ? (personasWithStories / personas.length) * 100 : 0;

  const coveragePercent = Math.round(
    (goalScore + epicScore + personaScore + painPointScore + storyLinkScore) / 5
  );

  return {
    projectName: project.name,
    coveragePercent,
    linkageValid: Boolean(completeThread),
    passThread: Boolean(completeThread),
    goals: goals.map((g: any) => ({
      id: g.id,
      title: g.title,
      detail: g.detail,
      epics: g.epics.map((epic: any) => ({
        id: epic.id,
        title: epic.title,
        storyTitles: epic.stories.map((s: any) => s.title),
        personaIds: Array.from(
          new Set(epic.stories.flatMap((s: any) => s.personas.map((link: any) => link.personaId))),
        ),
      })),
    })),
    personas: personas.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      painPoints: p.painPoints.map((pt: any) => ({ id: pt.id, statement: pt.statement })),
      linkedStories: p.stories.map((link: any) => ({ id: link.story.id, statement: link.story.title })),
    })),
    assembledAt: new Date().toISOString(),
  };
}

// PRD data for a single Build Phase (Build Pack artefact) — scoped to that
// phase's assigned Stories only, not the whole project backlog.
export async function assembleBuildPackData(buildPhaseId: string): Promise<any> {
  const buildPhase = await prisma.buildPhase.findUniqueOrThrow({
    where: { id: buildPhaseId },
    include: { project: true },
  });
  const stories = await prisma.story.findMany({
    where: { buildPhaseId },
    include: {
      epic: { include: { goal: true } },
      personas: { include: { persona: true } },
    },
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });
  const raid = await prisma.raidItem.findMany({ where: { projectId: buildPhase.projectId } });

  return {
    projectName: buildPhase.project.name,
    buildPhaseId: buildPhase.id,
    buildPhaseName: buildPhase.name,
    buildPhaseDescription: buildPhase.description ?? "",
    stories: stories.map((s: any) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? "",
      status: s.status,
      priority: s.priority,
      acceptance: Array.isArray(s.acceptance) ? s.acceptance : [],
      epicTitle: s.epic?.title ?? "",
      goalTitle: s.epic?.goal?.title ?? "",
      personaNames: s.personas.map((link: any) => link.persona.name),
    })),
    risks: raid.map((r: any) => ({ title: r.title, type: r.type, severity: r.severity, status: r.status })),
    assembledAt: new Date().toISOString(),
  };
}

// Build Sync File — clean CSV export, blank statuses, for handoff to a developer.
// Placeholder format (buildPhaseIdentifier/storyId/title/status columns) until
// the founder provides the real spec; column set kept in one place so the
// real format can replace this without touching the ingestion caller.
export function buildSyncCsvColumns(): string[] {
  return ["buildPhaseIdentifier", "storyId", "title", "status"];
}

export async function assembleBuildSyncCsv(buildPhaseId: string, blank: boolean): Promise<string> {
  const stories = await prisma.story.findMany({
    where: { buildPhaseId },
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });
  const columns = buildSyncCsvColumns();
  const rows = stories.map((s: any) => [
    buildPhaseId,
    s.id,
    csvEscape(s.title),
    blank ? "" : s.status,
  ]);
  return [columns.join(","), ...rows.map((r: string[]) => r.join(","))].join("\n");
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

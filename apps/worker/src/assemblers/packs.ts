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

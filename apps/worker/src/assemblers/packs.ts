import { prisma } from "../lib/prisma";

export async function assembleFounderPackData(projectId: string): Promise<any> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  return {
    projectName: project.name,
    summary: "No executive summary available.",
    vision: "No vision statement available.",
    targetAudience: "No target audience defined.",
    keyFeatures: [],
    revenueModel: "No revenue model defined.",
  };
}

export async function assembleProductPackData(projectId: string): Promise<any> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  const ambitions = await prisma.ambition.findMany({
    where: { projectId },
    include: { okrs: { include: { personaLinks: true } } },
  });
  const personas = await prisma.persona.findMany({
    where: { projectId },
    include: { painPoints: true, userNeeds: true },
  });
  const completeThread = ambitions.some((ambition: any) =>
    ambition.okrs.some((okr: any) =>
      okr.personaLinks.some((link: any) => {
        const persona = personas.find((item: any) => item.id === link.personaId);
        return persona?.painPoints.length && persona.userNeeds.length;
      }),
    ),
  );
  const ambitionScore = ambitions.length > 0 ? 100 : 0;
  const ambitionsWithOkrs = ambitions.filter((a: any) => a.okrs.length > 0).length;
  const okrScore = ambitions.length > 0 ? (ambitionsWithOkrs / ambitions.length) * 100 : 0;

  const personaScore = personas.length > 0 ? 100 : 0;
  const personasWithPainPoints = personas.filter((p: any) => p.painPoints.length > 0).length;
  const painPointScore = personas.length > 0 ? (personasWithPainPoints / personas.length) * 100 : 0;

  const personasWithUserNeeds = personas.filter((p: any) => p.userNeeds.length > 0).length;
  const userNeedScore = personas.length > 0 ? (personasWithUserNeeds / personas.length) * 100 : 0;

  const coveragePercent = Math.round(
    (ambitionScore + okrScore + personaScore + painPointScore + userNeedScore) / 5
  );

  return {
    projectName: project.name,
    coveragePercent,
    linkageValid: Boolean(completeThread),
    passThread: Boolean(completeThread),
    ambitions: ambitions.map((a: any) => ({
      id: a.id,
      title: a.title,
      detail: a.detail,
      okrs: a.okrs.map((okr: any) => ({
        id: okr.id,
        objective: okr.objective,
        keyResults: okr.keyResults,
        personaIds: okr.personaLinks.map((link: any) => link.personaId),
      })),
    })),
    personas: personas.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      painPoints: p.painPoints.map((pt: any) => ({ id: pt.id, statement: pt.statement })),
      userNeeds: p.userNeeds.map((n: any) => ({ id: n.id, statement: n.statement })),
    })),
    assembledAt: new Date().toISOString(),
  };
}

export async function assembleInvestorPackData(projectId: string): Promise<any> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const productPack = await assembleProductPackData(projectId);
  const activeCycle = await prisma.cycle.findFirst({
    where: { projectId, status: "active" },
  });
  const tasks = await prisma.task.findMany({
    where: { projectId, cycleId: activeCycle?.id || undefined },
  });
  const completedTasks = tasks.filter((t: any) => t.status === "done").length;
  const raid = await prisma.raidItem.findMany({
    where: { projectId },
  });
  const financeEntries = await prisma.financeEntry.findMany({
    where: { projectId },
  });
  const totalSpent = financeEntries.reduce((sum: number, entry: any) => sum + entry.amountMinor, 0);

  return {
    projectName: project.name,
    viabilityScore: 0,
    viabilityRationale: "No viability rationale provided.",
    productCoveragePercent: productPack.coveragePercent,
    deliveryLinkageValid: productPack.linkageValid,
    activeSprintCompletedTasks: completedTasks,
    activeSprintTotalTasks: tasks.length,
    totalBudgetSpentMinor: totalSpent,
    totalBudgetAllocatedMinor: Math.round(totalSpent * 1.5) || 500000,
    risksCount: raid.length,
    criticalRisksCount: raid.filter(
      (r: any) => r.severity === "critical" || r.severity === "high",
    ).length,
  };
}

export async function assembleBuildPackData(projectId: string): Promise<any> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const activeCycle = await prisma.cycle.findFirst({
    where: { projectId, status: "active" },
  });
  const stories = await prisma.userStory.findMany({
    where: { projectId },
  });
  const tasks = await prisma.task.findMany({
    where: { projectId, cycleId: activeCycle?.id || undefined },
    include: { assignee: true },
  });
  const raid = await prisma.raidItem.findMany({
    where: { projectId },
  });

  return {
    projectName: project.name,
    cycleName: activeCycle?.name || "No Active Cycle",
    cycleStatus: activeCycle?.status || "inactive",
    stories: stories.map((s: any) => ({
      title: s.title,
      status: s.status,
      description: s.description || "",
      acceptance: Array.isArray(s.acceptance) ? s.acceptance : [],
    })),
    tasks: tasks.map((t: any) => ({
      title: t.title,
      status: t.status,
      assigneeName: t.assignee?.preferredName || t.assignee?.email || "Unassigned",
    })),
    risks: raid.map((r: any) => ({
      title: r.title,
      severity: r.severity,
      status: r.status,
    })),
  };
}

import { prisma } from "../lib/prisma";

export async function assembleFounderPackData(projectId: string): Promise<any> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const latestPack = await prisma.founderPack.findFirst({
    where: { projectId, confirmedAt: { not: null } },
    orderBy: { version: "desc" },
  });
  const content = (latestPack?.content as any) || {};
  return {
    projectName: project.name,
    summary: content.summary || "No executive summary available.",
    vision: content.vision || "No vision statement available.",
    targetAudience: content.targetAudience || "No target audience defined.",
    keyFeatures: Array.isArray(content.keyFeatures) ? content.keyFeatures : [],
    revenueModel: content.revenueModel || "No revenue model defined.",
  };
}

export async function assembleProductPackData(projectId: string): Promise<any> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const latestPack = await prisma.productPack.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });

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
  const total = ambitions.length + personas.length;
  const covered =
    ambitions.filter((item: any) => item.okrs.length > 0).length +
    personas.filter((item: any) => item.painPoints.length > 0 && item.userNeeds.length > 0)
      .length;
  const coveragePercent = total ? Math.round((covered / total) * 100) : 0;

  return {
    projectName: project.name,
    coveragePercent: latestPack?.coveragePercent ?? coveragePercent,
    linkageValid: latestPack?.linkageValid ?? Boolean(completeThread),
    ambitions: ambitions.map((a: any) => ({ id: a.id, title: a.title, detail: a.detail })),
    personas: personas.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      userNeeds: p.userNeeds.map((n: any) => ({ id: n.id, statement: n.statement })),
      painPoints: p.painPoints.map((pt: any) => ({ id: pt.id, statement: pt.statement })),
    })),
  };
}

export async function assembleInvestorPackData(projectId: string): Promise<any> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const productPack = await assembleProductPackData(projectId);
  const viability = await prisma.viabilitySnapshot.findFirst({
    where: { projectId },
    orderBy: { createdAt: "desc" },
  });
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
    viabilityScore: viability?.overall ?? 0,
    viabilityRationale: viability?.rationale || "No viability rationale provided.",
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

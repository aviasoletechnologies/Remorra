import { prisma } from "../lib/prisma";

export async function projectContext(projectId: string) {
  return prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    include: {
      ambitions: { include: { okrs: true } },
      personas: { include: { painPoints: true, userNeeds: true } },
      userStories: true,
      tasks: true,
      cycles: true,
      raidItems: true,
      financeEntries: true,
      viabilitySnapshots: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

export async function assembleContext(projectId: string, requirements: string[]): Promise<string> {
  const sections: string[] = [];
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });

  for (const req of requirements) {
    switch (req) {
      case "project.metadata":
        sections.push(
          `<project_metadata trust="trusted">${JSON.stringify({
            id: project.id,
            name: project.name,
            summary: project.summary,
            phase: project.phase,
            version: project.version,
          })}</project_metadata>`,
        );
        break;
      case "project.phase":
        sections.push(`<project_phase trust="trusted">${project.phase}</project_phase>`);
        break;
      case "ambitions.all":
      case "okrs.all": {
        const ambitions = await prisma.ambition.findMany({
          where: { projectId },
          include: { okrs: true },
        });
        sections.push(`<ambitions trust="trusted">${JSON.stringify(ambitions)}</ambitions>`);
        break;
      }
      case "personas.all": {
        const personas = await prisma.persona.findMany({ where: { projectId } });
        sections.push(`<personas trust="trusted">${JSON.stringify(personas)}</personas>`);
        break;
      }
      case "personas.all_with_pain_points_and_user_needs": {
        const personas = await prisma.persona.findMany({
          where: { projectId },
          include: { painPoints: true, userNeeds: true },
        });
        sections.push(
          `<personas_with_needs trust="trusted">${JSON.stringify(
            personas,
          )}</personas_with_needs>`,
        );
        break;
      }
      case "linkage_map.full": {
        const [ambitions, personas, stories] = await Promise.all([
          prisma.ambition.findMany({ where: { projectId }, include: { okrs: true } }),
          prisma.persona.findMany({
            where: { projectId },
            include: { painPoints: true, userNeeds: true },
          }),
          prisma.userStory.findMany({ where: { projectId } }),
        ]);
        sections.push(
          `<linkage_map trust="trusted">${JSON.stringify({
            ambitions,
            personas,
            stories,
          })}</linkage_map>`,
        );
        break;
      }
      case "viability_score.current": {
        const snapshot = await prisma.viabilitySnapshot.findFirst({
          where: { projectId },
          orderBy: { createdAt: "desc" },
        });
        sections.push(`<viability_score trust="trusted">${JSON.stringify(snapshot)}</viability_score>`);
        break;
      }
      case "founder.preferred_name": {
        const owner = await prisma.profile.findFirst({
          where: { ownedProjects: { some: { id: projectId } } },
        });
        sections.push(
          `<founder trust="trusted">${JSON.stringify({
            preferredName: owner?.preferredName,
          })}</founder>`,
        );
        break;
      }
      case "user_stories.all": {
        const stories = await prisma.userStory.findMany({ where: { projectId } });
        sections.push(`<user_stories trust="trusted">${JSON.stringify(stories)}</user_stories>`);
        break;
      }
      case "tasks.all": {
        const tasks = await prisma.task.findMany({ where: { projectId } });
        sections.push(`<tasks trust="trusted">${JSON.stringify(tasks)}</tasks>`);
        break;
      }
      case "cycles.all": {
        const cycles = await prisma.cycle.findMany({ where: { projectId } });
        sections.push(`<cycles trust="trusted">${JSON.stringify(cycles)}</cycles>`);
        break;
      }
      case "raid_items.all": {
        const items = await prisma.raidItem.findMany({ where: { projectId } });
        sections.push(`<raid_items trust="trusted">${JSON.stringify(items)}</raid_items>`);
        break;
      }
      case "finance.all": {
        const entries = await prisma.financeEntry.findMany({ where: { projectId } });
        sections.push(`<finance trust="trusted">${JSON.stringify(entries)}</finance>`);
        break;
      }
      case "founder_pack.current": {
        const pack = await prisma.founderPack.findFirst({
          where: { projectId },
          orderBy: { version: "desc" },
        });
        sections.push(`<founder_pack trust="trusted">${JSON.stringify(pack)}</founder_pack>`);
        break;
      }
      case "product_pack.current": {
        const pack = await prisma.productPack.findFirst({
          where: { projectId },
          orderBy: { version: "desc" },
        });
        sections.push(`<product_pack trust="trusted">${JSON.stringify(pack)}</product_pack>`);
        break;
      }
    }
  }
  return sections.join("\n");
}

export async function injectKnowledgeBases(userContent: string, skillId: string) {
  const kbSkills = ["evolve-facilitator", "document-drafter"];
  if (!kbSkills.includes(skillId)) return [];
  const mappings = await prisma.knowledgeBaseTopicMapping.findMany({
    include: { knowledgeBase: { include: { versions: { where: { active: true }, take: 1 } } } },
  });
  const contentLower = userContent.toLowerCase();
  const matched: { tag: string; markdown: string }[] = [];
  for (const mapping of mappings) {
    if (contentLower.includes(mapping.topic.toLowerCase())) {
      const version = mapping.knowledgeBase.versions[0];
      if (version && mapping.knowledgeBase.active) {
        matched.push({ tag: mapping.knowledgeBase.id, markdown: version.markdown });
      }
    }
  }
  // Sort by priority (higher first) and deduplicate by KB id
  const seen = new Set<string>();
  return matched.filter((m) => {
    if (seen.has(m.tag)) return false;
    seen.add(m.tag);
    return true;
  });
}

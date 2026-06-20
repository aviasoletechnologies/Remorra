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
    },
  });
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

export async function assembleContext(
  projectId: string,
  inputSourceMap: {
    skills?: string[];
    tables?: Record<string, string[]>;
  }
) {
  const sections: { tag: string; trust: "trusted" | "application" | "user"; content: string }[] = [];

  // 1. Fetch other skills' conversations if configured
  if (inputSourceMap.skills && inputSourceMap.skills.length > 0) {
    for (const skillId of inputSourceMap.skills) {
      const conversations = await prisma.conversation.findMany({
        where: {
          projectId,
          activeSkillId: skillId,
        },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (conversations.length > 0) {
        const messagesText = conversations
          .flatMap((c: any) => c.messages)
          .map((m: any) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
          .join("\n");

        if (messagesText.trim()) {
          sections.push({
            tag: `skill_conversation_history_${skillId.replace(/[^a-zA-Z0-9]/g, "_")}`,
            trust: "trusted",
            content: `Conversation history for skill ${skillId}:\n\n${messagesText}`,
          });
        }
      }
    }
  }

  // 2. Fetch and filter project tables dynamically
  if (inputSourceMap.tables && Object.keys(inputSourceMap.tables).length > 0) {
    const filteredData: Record<string, any> = {};

    for (const [tableName, columns] of Object.entries(inputSourceMap.tables)) {
      if (tableName === "Project") {
        const rawProject = await prisma.project.findUniqueOrThrow({
          where: { id: projectId },
        });
        const projData: Record<string, any> = {};
        const selectedCols = Array.isArray(columns) && columns.length > 0
          ? columns
          : ["id", "name", "summary", "phase", "version"];
        for (const col of selectedCols) {
          if (col in rawProject) {
            projData[col] = (rawProject as any)[col];
          }
        }
        filteredData["Project"] = projData;
      } else {
        const delegateName = tableName.charAt(0).toLowerCase() + tableName.slice(1);
        if (delegateName in prisma) {
          const records = await (prisma as any)[delegateName].findMany({
            where: { projectId },
          });

          if (Array.isArray(records)) {
            filteredData[tableName] = records.map((rec: any) => {
              const hasNoSelectedColumns = !Array.isArray(columns) || columns.length === 0;
              if (hasNoSelectedColumns) {
                // Return full record: "yes if admin select only table then pass all columns"
                return rec;
              }

              const filteredRec: Record<string, any> = {};
              for (const col of columns) {
                if (col in rec) {
                  filteredRec[col] = rec[col];
                }
              }
              return filteredRec;
            });
          }
        }
      }
    }

    if (Object.keys(filteredData).length > 0) {
      sections.push({
        tag: "application_context",
        trust: "application",
        content: JSON.stringify(filteredData, null, 2),
      });
    }
  }

  return sections;
}

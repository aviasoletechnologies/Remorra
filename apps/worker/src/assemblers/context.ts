import { Prisma } from "@remorra/database/generated/client";
import { prisma } from "../lib/prisma";
import { generateEmbedding } from "../services/embedding";

const KB_THRESHOLDS = {
  veryShort: 0.50, // 1-6 words
  short: 0.55,     // 7-15 words
  medium: 0.62,    // 16-40 words
  long: 0.70,      // 40+ words
};

function getKbThreshold(text: string): number {
  const words = text.trim().split(/\s+/).length;
  if (words <= 6) return KB_THRESHOLDS.veryShort;
  if (words <= 15) return KB_THRESHOLDS.short;
  if (words <= 40) return KB_THRESHOLDS.medium;
  return KB_THRESHOLDS.long;
}
type KnowledgeBaseMatch = { id: string; similarity: number };

export async function injectKnowledgeBases(
  userContent: string,
  skillId: string,
  conversationId?: string,
  onLog?: (msg: string, metadata?: any) => void,
) {
  try {
    // Stage 1: skill gate
    const skill = await prisma.skill.findUnique({ where: { id: skillId }, select: { kbEligible: true } });
    if (!skill?.kbEligible) return [];

    // Stage 2: build query text (current message + recent history for better context)
    let queryText = userContent;
    if (conversationId) {
      const recent = await prisma.conversationMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { content: true },
      });
      if (recent.length > 0) {
        queryText = recent.map((m: { content: string }) => m.content).reverse().join(" ") + " " + userContent;
      }
    }

    // Stage 3: embed query text
    const embedding = await generateEmbedding(queryText);
    const vecLiteral = Prisma.raw(`'[${embedding.join(",")}]'::vector`);

    // Stage 4: pgvector cosine similarity search
    const matches: KnowledgeBaseMatch[] = await prisma.$queryRaw<KnowledgeBaseMatch[]>(
      Prisma.sql`
        SELECT id, 1 - (embedding <=> ${vecLiteral}) AS similarity
        FROM "KnowledgeBase"
        WHERE active = true AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vecLiteral}
        LIMIT 5
      `,
    );

    const threshold = getKbThreshold(userContent);
    const scores = Object.fromEntries(matches.map((m) => [m.id, Number(m.similarity).toFixed(4)]));
    onLog?.("KB similarity scores", { stage: "kb_similarity", threshold, scores, queryDims: embedding.length });

    const relevant = matches.filter((m) => m.similarity >= threshold);
    onLog?.(`KB injection: ${relevant.length} matched`, { stage: "kb_injection", injected: relevant.map((m) => m.id) });
    if (relevant.length === 0) return [];

    // Stage 5: fetch active version markdown for matched KBs
    const kbIds = relevant.map((m) => m.id);
    const versions = await prisma.knowledgeBaseVersion.findMany({
      where: { knowledgeBaseId: { in: kbIds }, active: true },
      select: { knowledgeBaseId: true, markdown: true },
    });

    const markdownMap = new Map(versions.map((v: { knowledgeBaseId: string; markdown: string }) => [v.knowledgeBaseId, v.markdown]));

    return relevant
      .filter((m) => markdownMap.has(m.id))
      .map((m) => ({ tag: m.id, markdown: markdownMap.get(m.id)! }));
  } catch (err) {
    console.warn("[injectKnowledgeBases] failed:", err);
    return [];
  }
}

export async function assembleContext(
  projectId: string,
  inputSourceMap: {
    skills?: string[];
    tables?: Record<string, string[]>;
  },
  previousSkillId?: string,
  currentSkillId?: string,
) {
  const sections: { tag: string; trust: "trusted" | "application" | "user"; content: string }[] = [];

  // 1. Fetch other skills' conversations if configured
  if (inputSourceMap.skills && inputSourceMap.skills.length > 0) {
    const resolvedSkills: string[] = [];

    if (previousSkillId) {
      resolvedSkills.push(previousSkillId);
    } else {
      for (const skillId of inputSourceMap.skills) {
        if (skillId !== "@previous") {
          resolvedSkills.push(skillId);
        }
      }
    }

    for (const skillId of resolvedSkills) {
      // Skip current skill — conversation_history in skills.ts already covers it
      if (skillId === currentSkillId) continue;

      // Find most recent conversation for this skill in this project
      const lastMsg = await prisma.conversationMessage.findFirst({
        where: { conversation: { projectId }, skillId },
        orderBy: { createdAt: "desc" },
        select: { conversationId: true },
      });

      if (!lastMsg) continue;

      // Prefer structured JSON output (entity-extractor style skills)
      const extract = await prisma.structuredExtract.findFirst({
        where: { conversationId: lastMsg.conversationId },
        orderBy: { createdAt: "desc" },
      });

      if (extract?.payload) {
        sections.push({
          tag: `skill_output_${skillId.replace(/[^a-zA-Z0-9]/g, "_")}`,
          trust: "trusted",
          content: `Output from skill ${skillId}:\n\n${JSON.stringify(extract.payload, null, 2)}`,
        });
      } else {
        // Fallback: last assistant message only (conversational skills)
        const lastAssistant = await prisma.conversationMessage.findFirst({
          where: { conversationId: lastMsg.conversationId, skillId, role: "assistant" },
          orderBy: { createdAt: "desc" },
        });
        if (lastAssistant?.content?.trim()) {
          sections.push({
            tag: `skill_output_${skillId.replace(/[^a-zA-Z0-9]/g, "_")}`,
            trust: "trusted",
            content: `Output from skill ${skillId}:\n\n${lastAssistant.content}`,
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

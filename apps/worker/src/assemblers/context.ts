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

function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, "");
}

function toYaml(obj: any): string {
  if (Array.isArray(obj)) {
    return obj.map(item => toYaml(item).split("\n").map(line => `  ${line}`).join("\n")).join("\n---\n");
  }
  if (obj && typeof obj === "object") {
    return Object.entries(obj)
      .map(([k, v]) => {
        if (typeof v === "object" && v !== null) {
          return `${k}:\n${toYaml(v).split("\n").map(line => `  ${line}`).join("\n")}`;
        }
        return `${k}: ${v ?? "null"}`;
      })
      .join("\n");
  }
  return String(obj);
}

function filterColumns(rec: any, columns: string[], forceColumns: string[] = []) {
  if (!columns || columns.length === 0) return rec;
  const filtered: Record<string, any> = {};
  const allowed = new Set([...columns, ...forceColumns]);
  for (const key of Object.keys(rec)) {
    if (allowed.has(key)) {
      filtered[key] = rec[key];
    }
  }
  return filtered;
}

export async function assembleContext(
  projectId: string,
  inputSourceMap: {
    skills?: string[];
    tables?: Record<string, string[]>;
  },
  previousSkillId?: string,
  currentSkillId?: string,
  userId?: string,
) {
  const sections: { tag: string; trust: "trusted" | "application" | "user"; content: string }[] = [];

  // 1. Fetch other skills' conversations
  const resolvedSkills = new Set<string>();
  if (previousSkillId) resolvedSkills.add(previousSkillId);
  for (const skillId of inputSourceMap.skills ?? []) {
    if (skillId !== "@previous") resolvedSkills.add(skillId);
  }

  if (resolvedSkills.size > 0) {
    for (const skillId of resolvedSkills) {
      if (skillId === currentSkillId) continue;

      const lastMsg = await prisma.conversationMessage.findFirst({
        where: { conversation: { projectId }, skillId },
        orderBy: { createdAt: "desc" },
        select: { conversationId: true },
      });

      if (!lastMsg) continue;

      const extract = await prisma.structuredExtract.findFirst({
        where: { conversationId: lastMsg.conversationId },
        orderBy: { createdAt: "desc" },
      });

      const tag = `skill_output_${skillId.replace(/[^a-zA-Z0-9]/g, "_")}`;

      if (extract?.payload) {
        sections.push({
          tag,
          trust: "trusted",
          content: `<${tag}>\n${JSON.stringify(extract.payload, null, 2)}\n</${tag}>`,
        });
      } else {
        const lastAssistant = await prisma.conversationMessage.findFirst({
          where: { conversationId: lastMsg.conversationId, skillId, role: "assistant" },
          orderBy: { createdAt: "desc" },
        });
        if (lastAssistant?.content?.trim()) {
          sections.push({
            tag,
            trust: "trusted",
            content: `<${tag}>\n${lastAssistant.content}\n</${tag}>`,
          });
        }
      }
    }
  }

  // 2. Fetch and filter project tables dynamically
  if (inputSourceMap.tables && Object.keys(inputSourceMap.tables).length > 0) {
    for (const [tableName, columns] of Object.entries(inputSourceMap.tables)) {
      if (tableName === "Project") {
        const rawProject = await prisma.project.findUniqueOrThrow({
          where: { id: projectId },
        });

        if (columns.includes("context")) {
          sections.push({
            tag: "project_context",
            trust: "application",
            content: `<project_context>\n${
              rawProject.context
                ? typeof rawProject.context === "string"
                  ? rawProject.context
                  : JSON.stringify(rawProject.context, null, 2)
                : ""
            }\n</project_context>`,
          });
        }

        const metadataCols = columns.length > 0 ? columns.filter(c => c !== "context") : ["name", "summary", "phase", "version"];
        const projData: Record<string, any> = {};
        for (const col of metadataCols) {
          if (col in rawProject) {
            projData[col] = (rawProject as any)[col];
          }
        }

        if (Object.keys(projData).length > 0) {
          sections.push({
            tag: "project_metadata",
            trust: "application",
            content: `<project_metadata>\n${toYaml(projData)}\n</project_metadata>`,
          });
        }
      } else if (tableName === "Goal") {
        const records = await prisma.goal.findMany({ where: { projectId } });
        const formatted = records.map((rec: any) => filterColumns(rec, columns)).map(toYaml).join("\n---\n");
        sections.push({
          tag: "goals_all",
          trust: "application",
          content: `<goals_all>\n${formatted}\n</goals_all>`,
        });
      } else if (tableName === "Epic") {
        const records = await prisma.epic.findMany({ where: { projectId } });
        // No forced "goalId" — unlike Story/PainPoint, no current skill needs it,
        // and force-including it alongside "id" caused a real bug: a skill asking
        // for Epic "id" (to link a Story to it) saw two UUID-looking fields per
        // Epic and grabbed the wrong one (goalId instead of id). Only include a
        // field here if a skill's own inputSourceMap explicitly asks for it.
        const formatted = records.map((rec: any) => filterColumns(rec, columns)).map(toYaml).join("\n---\n");
        sections.push({
          tag: "epics_all",
          trust: "application",
          content: `<epics_all>\n${formatted}\n</epics_all>`,
        });
      } else if (tableName === "Story") {
        const records = await prisma.story.findMany({
          where: { projectId },
          include: { personas: { include: { persona: { select: { name: true } } } } },
        });
        const formatted = records.map((rec: any) => {
          const base = filterColumns(rec, columns, ["epicId", "buildPhaseId"]);
          const linkedPersonas = rec.personas.map((p: any) => p.persona.name).join(", ");
          return {
            ...base,
            linkedPersonas: linkedPersonas || "None",
          };
        }).map(toYaml).join("\n---\n");
        sections.push({
          tag: "stories_all",
          trust: "application",
          content: `<stories_all>\n${formatted}\n</stories_all>`,
        });
      } else if (tableName === "Persona") {
        const records = await prisma.persona.findMany({
          where: { projectId },
          include: { painPoints: true },
        });
        const formatted = records.map((rec: any) => {
          const base = filterColumns(rec, columns);
          const painPointsList = rec.painPoints.map((pt: any) => `- ${pt.statement}`).join("\n");
          return {
            ...base,
            painPoints: painPointsList || "None",
          };
        }).map(toYaml).join("\n---\n");
        sections.push({
          tag: "personas_all_with_pain_points",
          trust: "application",
          content: `<personas_all_with_pain_points>\n${formatted}\n</personas_all_with_pain_points>`,
        });
      } else if (tableName === "PainPoint") {
        const records = await prisma.painPoint.findMany({ where: { projectId } });
        const formatted = records.map((rec: any) => filterColumns(rec, columns, ["personaId"])).map(toYaml).join("\n---\n");
        sections.push({
          tag: "pain_point_all",
          trust: "application",
          content: `<pain_point_all>\n${formatted}\n</pain_point_all>`,
        });
      } else if (tableName === "RaidItem") {
        const records = await prisma.raidItem.findMany({ where: { projectId } });
        const formatted = records.map((rec: any) => filterColumns(rec, columns)).map(toYaml).join("\n---\n");
        sections.push({
          tag: "raid_all",
          trust: "application",
          content: `<raid_all>\n${formatted}\n</raid_all>`,
        });
      } else if (tableName === "ProjectMembership") {
        // project.team — members with names and roles
        const members = await prisma.projectMembership.findMany({
          where: { projectId },
          include: { user: { select: { id: true, preferredName: true, email: true } } },
        });
        const formatted = members.map((m: any) => ({
          userId: m.userId,
          name: m.user.preferredName ?? m.user.email,
          role: m.role,
        })).map(toYaml).join("\n---\n");
        sections.push({
          tag: "project_team",
          trust: "application",
          content: `<project_team>\n${formatted}\n</project_team>`,
        });
      } else if (tableName === "HealthScore") {
        // health_score.current — latest health score with components
        const latest = await prisma.healthScore.findFirst({
          where: { projectId },
          orderBy: { calculatedAt: "desc" },
          include: { components: true },
        });
        if (latest) {
          const data = {
            overallScore: latest.overallScore,
            readinessAssessment: latest.readinessAssessment,
            calculatedAt: latest.calculatedAt,
            components: latest.components.map((c: any) => ({
              component: c.component,
              weight: c.weight,
              score: c.score,
              rationale: c.rationale,
            })),
          };
          sections.push({
            tag: "health_score_current",
            trust: "application",
            content: `<health_score_current>\n${toYaml(data)}\n</health_score_current>`,
          });
        }
      } else if (tableName === "AuditEvent") {
        // audit.recent — last 20 audit events with source attribution
        const events = await prisma.auditEvent.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            eventType: true,
            entityType: true,
            entityId: true,
            source: true,
            createdAt: true,
            metadata: true,
          },
        });
        const formatted = events.map((e: any) => ({
          eventType: e.eventType,
          entityType: e.entityType ?? null,
          entityId: e.entityId ?? null,
          source: e.source ?? null,
          createdAt: e.createdAt,
          metadata: e.metadata,
        })).map(toYaml).join("\n---\n");
        sections.push({
          tag: "audit_recent",
          trust: "application",
          content: `<audit_recent>\n${formatted}\n</audit_recent>`,
        });
      } else if (tableName === "BuildPhase") {
        // build_phase.current — active build phase with stories and statuses
        const phase = await prisma.buildPhase.findFirst({
          where: { projectId, status: "active" },
          include: {
            stories: {
              select: { id: true, title: true, status: true, priority: true },
            },
          },
        });
        if (phase) {
          const data = {
            id: phase.id,
            name: phase.name,
            description: phase.description ?? null,
            status: phase.status,
            stories: (phase as any).stories.map((s: any) => ({
              id: s.id,
              title: s.title,
              status: s.status,
              priority: s.priority,
            })),
          };
          sections.push({
            tag: "build_phase_current",
            trust: "application",
            content: `<build_phase_current>\n${toYaml(data)}\n</build_phase_current>`,
          });
        }
      } else if (tableName === "UserPreferredName") {
        // user.preferred_name — calling user's name for personalised responses
        if (userId) {
          const profile = await prisma.profile.findUnique({
            where: { id: userId },
            select: { preferredName: true, email: true },
          });
          if (profile) {
            sections.push({
              tag: "user_preferred_name",
              trust: "application",
              content: `<user_preferred_name>${profile.preferredName ?? profile.email}</user_preferred_name>`,
            });
          }
        }
      } else {
        // Generic fallback for any other database tables
        const delegateName = tableName.charAt(0).toLowerCase() + tableName.slice(1);
        const delegate = (prisma as any)[delegateName];
        if (delegate?.findMany) {
          const records = await delegate.findMany({ where: { projectId } });
          if (Array.isArray(records)) {
            const formatted = records.map((rec: any) => filterColumns(rec, columns)).map(toYaml).join("\n---\n");
            const tag = `${toSnakeCase(tableName)}_all`;
            sections.push({
              tag,
              trust: "application",
              content: `<${tag}>\n${formatted}\n</${tag}>`,
            });
          }
        }
      }
    }
  }

  return sections;
}

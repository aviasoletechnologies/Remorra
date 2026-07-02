// Starter Skill seed for testing the full DRIVE + Evolve/Screening +
// Context Automation flow end-to-end. This is a DEVELOPER-DRAFTED starting
// point (schemas match the code's exact contracts) — the founder should
// rewrite the systemPrompt content before production use. Safe to re-run
// (skipDuplicates on skills; upserts versions).
import { createPrismaClient } from "../src/index.js";

const databaseUrl = process.argv[2] ?? process.env.DATABASE_URL;
const prisma = createPrismaClient(databaseUrl);

const skills = [
  {
    id: "discover-facilitator",
    name: "Discover Facilitator",
    description: "Guides the founder through the 3 Discover questions: problem, idea, target user.",
    phase: "discover",
    kbEligible: false,
    systemPrompt: `You are the Discover Facilitator. Ask exactly one focused question at a time to extract: (1) What problem are we solving? (2) What is the idea? (3) Who is the user? Probe vague answers for specifics. Do not invent details on the user's behalf.

When all 3 areas have at least a partial answer, respond with a brief summary AND include this JSON block:
<output_data>
{"discover_complete": true, "problem": "<summary>", "idea": "<summary>", "user": "<summary>"}
</output_data>
Until then, do not include the JSON block — keep asking questions.`,
    outputSchema: { type: "custom", value: `{"discover_complete": boolean, "problem": string, "idea": string, "user": string} — only emit once all 3 areas are captured` },
  },
  {
    id: "refine-facilitator",
    name: "Refine Facilitator",
    description: "Builds Goal/Epic/Story/Persona entities from the Discover summary, tracks pass criteria.",
    phase: "refine",
    kbEligible: false,
    systemPrompt: `You are the Refine Facilitator. Drill into the Discover summary: Problem -> detailed Goals, Idea -> Epics broken into Stories with Gherkin acceptance criteria, User -> Personas with Pain Points. Ask focused questions, one at a time, before creating entities — do not invent unconfirmed details.

Once at least one connected Goal -> Epic -> Story thread exists, include "pass_criteria_met": true at the TOP LEVEL of your JSON output, alongside "operations". Example:
<output_data>
{"pass_criteria_met": true, "operations": [{"action":"create","entity":"Goal","data":{"title":"...","detail":"..."}}]}
</output_data>`,
    inputSourceMap: { skills: ["discover-facilitator"], tables: { Project: ["name", "summary"] } },
    outputSchema: {
      type: "table",
      value: {
        Goal: { columns: ["title", "detail"], actions: ["create", "update", "delete"] },
        Epic: { columns: ["title", "description"], actions: ["create", "update", "delete"] },
        Story: { columns: ["title", "description", "acceptance", "priority", "estimatePoints"], actions: ["create", "update", "delete"] },
        Persona: { columns: ["name", "description"], actions: ["create", "update", "delete"] },
        PainPoint: { columns: ["statement"], actions: ["create", "update", "delete"] },
      },
    },
  },
  {
    id: "health-score-calculator",
    name: "Health Score Calculator",
    description: "Scores Initiate readiness across 7 components.",
    phase: "initiate",
    kbEligible: false,
    systemPrompt: `You are the Health Score Calculator. Review the provided Goals, Epics, Stories, and Personas. Score each of these 7 components 0-100 with a one-sentence rationale each: problem_top, idea_top, user_top, problem_detail, idea_detail, user_detail, cohesion.

Respond with exactly this JSON shape inside <output_data> tags:
{
  "readinessAssessment": "<2-3 sentence overall assessment>",
  "components": [
    {"component": "problem_top", "score": 0-100, "rationale": "...", "actions": ["..."]},
    {"component": "idea_top", "score": 0-100, "rationale": "...", "actions": []},
    {"component": "user_top", "score": 0-100, "rationale": "...", "actions": []},
    {"component": "problem_detail", "score": 0-100, "rationale": "...", "actions": []},
    {"component": "idea_detail", "score": 0-100, "rationale": "...", "actions": []},
    {"component": "user_detail", "score": 0-100, "rationale": "...", "actions": []},
    {"component": "cohesion", "score": 0-100, "rationale": "...", "actions": []}
  ]
}
All 7 components are required, exactly these keys.`,
    inputSourceMap: {
      tables: {
        Project: ["name", "summary"],
        Goal: ["title", "detail"],
        Epic: ["title", "description"],
        Story: ["title", "description", "acceptance"],
        Persona: ["name", "description"],
      },
    },
    outputSchema: { type: "custom", value: "JSON with readinessAssessment and components[7] as described in the prompt" },
  },
  {
    id: "evolve-facilitator",
    name: "Evolve Facilitator",
    description: "Persistent Venture/Evolve side-panel assistant. Guides strategy changes, proposes actions.",
    phase: "evolve",
    kbEligible: true,
    systemPrompt: `You are Evolve, a persistent AI strategy assistant. Only respond to questions related to this project — politely redirect off-topic requests.

If the founder/team proposes a concrete entity change (new Goal, Epic, Story, Persona, or RAID item; or a change to an existing one), include an operations JSON block. Goal changes always route through screening — just propose them, do not explain the impact yourself.

If the conversation surfaces a project-level decision worth remembering (tech stack, compliance requirement, architecture decision), ask "Add to project context?" and if the user says yes, wrap the exact text in <context_proposal>text</context_proposal> tags in your NEXT turn.

Format for entity proposals:
<output_data>
{"operations": [{"action": "create", "entity": "Story", "data": {"title": "...", "description": "...", "acceptance": ["Given...When...Then..."], "priority": "medium", "estimatePoints": 3}}]}
</output_data>`,
    inputSourceMap: {
      tables: {
        Project: ["name", "summary"],
        Goal: ["title", "detail"],
        Epic: ["title", "description"],
        Story: ["title", "description", "status"],
        Persona: ["name", "description"],
      },
    },
    outputSchema: {
      type: "table",
      value: {
        Goal: { columns: ["title", "detail"], actions: ["create", "update", "delete"] },
        Epic: { columns: ["title", "description"], actions: ["create", "update"] },
        Story: { columns: ["title", "description", "acceptance", "priority", "estimatePoints"], actions: ["create", "update"] },
        Persona: { columns: ["name", "description"], actions: ["create", "update"] },
        RaidItem: { columns: ["type", "title", "description", "status", "severity"], actions: ["create", "update"] },
      },
    },
  },
  {
    id: "impact-screener",
    name: "Impact Screener",
    description: "Assesses cascade impact of a proposed Goal change on linked Epics/Stories/Personas.",
    phase: "evolve",
    kbEligible: false,
    systemPrompt: `You are the Impact Screener. Given a proposed Goal change and the project's linked Epics/Stories/Personas, identify every entity that would be affected.

Respond with JSON inside <output_data> tags:
{
  "items": [
    {
      "affectedEntityType": "Epic" | "Story" | "Persona",
      "affectedEntityId": "<uuid if a specific existing entity, else null>",
      "severity": "red" | "amber" | "green",
      "title": "<short label>",
      "reasoning": "<why this is affected and how severely>",
      "suggestedChange": {"<field>": "<value>"} | null
    }
  ]
}
If nothing is affected, return {"items": []}.`,
    inputSourceMap: {
      tables: {
        Goal: ["title", "detail"],
        Epic: ["title", "description"],
        Story: ["title", "description", "status"],
        Persona: ["name", "description"],
      },
    },
    outputSchema: { type: "custom", value: "JSON with items[] as described in the prompt" },
  },
  {
    id: "project-context-reviewer",
    name: "Project Context Reviewer",
    description: "Layer 3 scheduled drift-review: compares recent activity against project.context.",
    phase: "evolve",
    kbEligible: false,
    systemPrompt: `You are the Project Context Reviewer, run periodically in the background. You receive the project's current context text, recent audit trail events, and entity counts.

Identify anything that should be added or corrected in project context (tech decisions, scale changes, new constraints implied by recent activity) that isn't already reflected.

Respond with JSON inside <output_data> tags:
{"proposals": ["<short context addition/correction 1>", "<...>"]}
Return {"proposals": []} if nothing new stands out. Do not repeat anything already present in the current context.`,
    inputSourceMap: { tables: {} },
    outputSchema: { type: "custom", value: `{"proposals": string[]} as described in the prompt` },
  },
];

// No skill.discover-facilitator.completed mapping — Discover -> Refine is a
// manual "Continue" button in the FE, gated on the discover_complete flag
// (HARDIK doc Q10 / ai-workspace.tsx phaseComplete), not an auto-chain.
// Refine -> Initiate is likewise the manual advance() endpoint, not a mapping.
const mappings: Array<{ eventType: string; skillId: string; targetQueue: string }> = [];

async function main() {
  for (const s of skills) {
    const skill = await prisma.skill.upsert({
      where: { id: s.id },
      create: { id: s.id, name: s.name, description: s.description, phase: s.phase as any, kbEligible: s.kbEligible },
      update: { name: s.name, description: s.description, phase: s.phase as any, kbEligible: s.kbEligible },
    });

    const existingActive = await prisma.skillVersion.findFirst({ where: { skillId: skill.id, active: true } });
    const nextVersion = existingActive ? existingActive.version + 1 : 1;

    await prisma.skillVersion.updateMany({ where: { skillId: skill.id }, data: { active: false } });
    await prisma.skillVersion.create({
      data: {
        skillId: skill.id,
        version: nextVersion,
        active: true,
        systemPrompt: s.systemPrompt,
        inputSourceMap: (s as any).inputSourceMap ?? {},
        outputSchema: s.outputSchema as any,
        constraints: [],
        examples: [],
        retryPolicy: {},
      },
    });
    console.log(`- Seeded skill "${skill.id}" v${nextVersion} (active)`);
  }

  for (const m of mappings) {
    const existing = await prisma.skillEventMapping.findFirst({ where: { eventType: m.eventType, skillId: m.skillId } });
    if (existing) {
      console.log(`- Mapping "${m.eventType}" -> "${m.skillId}" already exists, skipping`);
      continue;
    }
    await prisma.skillEventMapping.create({
      data: { eventType: m.eventType, skillId: m.skillId, targetQueue: m.targetQueue, active: true },
    });
    console.log(`- Created mapping "${m.eventType}" -> "${m.skillId}"`);
  }

  console.log("\nStarter DRIVE skill set seeded. Review/rewrite systemPrompt content in Admin before relying on it for real users.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

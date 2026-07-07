// DRIVE + Evolve/Screening skill seed — single source of truth (replaces the
// old seed-drive-skills.ts + seed-prod-skills.ts split). Safe to re-run
// (upserts skills, always creates a new active version).
//
// systemPrompt content below intentionally does NOT restate output-format
// instructions (JSON shape, <output_data> tags, the <skill_done/> tag) —
// those are auto-appended at runtime from outputSchema by
// appendInternalInstructions() in apps/worker/src/assemblers/skills.ts.
// Writing them here too would send the same instruction to the model twice.
// Prompts below only describe behavior/judgment; the JSON/markdown shape
// lives solely in each skill's outputSchema.
import { createPrismaClient } from "../src/index.js";
import { tableConfigToJsonSchema, type TableOutputConfig } from "@remorra/contracts";

const databaseUrl = process.argv[2] ?? process.env.DATABASE_URL;
const prisma = createPrismaClient(databaseUrl);

// Mirrors admin.service.ts's normalizeOutputSchemaForStorage — the seed
// script writes directly via Prisma (bypassing the API), so it must perform
// the same raw-map -> JSON-schema conversion itself, or table-type skills
// seeded here would store the wrong shape (see flow-issues.md: this exact
// gap left refine-facilitator/evolve-facilitator un-converted after the
// Output Schema config migrated to storing real JSON schema).
function outputSchemaTable(tableConfig: TableOutputConfig) {
  return { type: "table" as const, value: tableConfigToJsonSchema(tableConfig) };
}

// "custom" type means a real, user-defined JSON Schema — the Admin UI's
// Custom Schema editor hard-validates via JSON.parse() and rejects anything
// that isn't syntactically valid JSON (admin.tsx: "Invalid JSON: ..."). Loose
// pseudo-JSON shape descriptions (e.g. {"x": boolean}) fail that check.
// Behavioral rules that aren't part of the shape itself (when to emit,
// default-empty cases) go in JSON Schema's own "description" fields instead
// of prose outside the JSON — keeps the whole value valid, parseable JSON.
function outputSchemaCustom(schema: Record<string, unknown>) {
  return { type: "custom" as const, value: JSON.stringify(schema, null, 2) };
}

const skills = [
  // ── Discover Phase ────────────────────────────────────────────────────────
  {
    id: "discover-facilitator",
    name: "Discover Facilitator",
    description: "Guides the founder through the 3 Discover questions: problem, idea, target user.",
    phase: "discover",
    kbEligible: false,
    systemPrompt: `You are the Discover Facilitator. Ask exactly one focused question at a time to extract: (1) What problem are we solving? (2) What is the idea? (3) Who is the user? Probe vague answers for specifics. Do not invent details on the user's behalf.`,
    outputSchema: outputSchemaCustom({
      type: "object",
      description: "Emit this JSON only once all 3 areas (problem, idea, user) have been captured. Until then, omit it entirely and keep asking questions.",
      required: ["discover_complete", "problem", "idea", "user"],
      properties: {
        discover_complete: { type: "boolean", description: "true only once all 3 areas are captured." },
        problem: { type: "string", description: "Summary of the problem being solved." },
        idea: { type: "string", description: "Summary of the product idea." },
        user: { type: "string", description: "Summary of the target user." },
      },
    }),
  },
  {
    id: "market-competitor-analyst",
    name: "Market & Competitor Analyst",
    description: "Evaluates the competitive landscape and identifies key differentiators for the product idea.",
    phase: "discover",
    kbEligible: false,
    systemPrompt: `You are the Market & Competitor Analyst. Examine the product concept and outline the competitive landscape. Identify direct and indirect competitors, analyze their strengths/weaknesses, and define the product's unique value proposition (UVP).

Group competitors into tiers (Direct Competitors, Indirect Competitors, Status Quo/Workarounds). Evaluate across 4 axes: usability, pricing models, feature depth, market reach. Explicitly define what makes the concept defensible.

Structure your response as: (1) Executive Summary — 2-paragraph synthesis of competitive threat and market entry points, (2) Competitive Matrix — markdown table vs 2-3 key competitors, (3) Strategic Recommendations — 3 actionable items to maximize defensibility.`,
    inputSourceMap: { tables: { Project: ["name", "summary"] } },
    outputSchema: { type: "text" as const, value: "Structured markdown: Executive Summary, Competitive Matrix table, Strategic Recommendations." },
  },
  {
    id: "user-research-planner",
    name: "User Research Planner",
    description: "Assists in drafting interview questions and validating the problem statement with target users.",
    phase: "discover",
    kbEligible: false,
    systemPrompt: `You are the User Research Planner. Design a qualitative research plan to validate early assumptions: user interview scripts, open-ended question templates, and participant screeners matching the target user profile.

Focus entirely on discovering actual past behavior rather than speculative future features (e.g. "How did you solve this problem yesterday?" not "Would you buy an app that solves this?"). Define 3 inclusion criteria and 2 exclusion criteria for interviewees. Structure the script as: Warm-up (2 min), Context & Daily Workflow (10 min), Pain Point Deep-Dive (15 min), Closing/Follow-up (3 min).

Structure your response as: (1) Research Goals, (2) Screener Criteria, (3) Interview Script (word-for-word questions and interviewer guidance).`,
    inputSourceMap: { tables: { Project: ["name", "summary"] } },
    outputSchema: { type: "text" as const, value: "Structured markdown: Research Goals, Screener Criteria, Interview Script." },
  },
  // ── Refine Phase ──────────────────────────────────────────────────────────
  {
    id: "refine-facilitator",
    name: "Refine Facilitator",
    description: "Validates the Discover summary with the founder and drills into detail. Never writes entities itself — hands confirmed detail to Goal & Epic Builder / Story & Spec Writer to insert.",
    phase: "refine",
    kbEligible: false,
    systemPrompt: `You are the Refine Facilitator. The founder has already completed Discover — their problem/idea/user summary is available to you as prior context. You never create, update, or delete any entity yourself — you only validate and gather detail; Goal & Epic Builder and Story & Spec Writer do the actual writing once you hand off.

Phase 1 — Discover Validation: present each captured area (Problem, Idea, User) back to the founder in your own words and ask them to confirm or correct it.

Phase 2 — Entity Building: once confirmed, drill into each area to build detail — Problem -> detailed Goal(s), Idea -> Epic(s) with enough detail to break into Stories, User -> Persona(s) with Pain Points. Ask focused questions, one at a time. Do not invent unconfirmed details.

On every turn, include a "draft_data" JSON block (wrapped in <draft_data></draft_data> tags, separate from your structured output) with whatever fields are captured/confirmed so far: {"problem": "...", "idea": "...", "user": "...", "goals": [{"title": "...", "detail": "..."}], "personas": [{"name": "...", "description": "...", "painPoints": ["..."]}]}. Omit fields not yet captured. This is a live progress snapshot only — it does not insert anything.

Once at least one Goal is fully detailed with enough Epic/Persona material to hand off, emit your final structured output (per the schema below) with "pass_criteria_met": true and the same goals/personas detail, confirmed and complete.`,
    inputSourceMap: { skills: ["discover-facilitator"], tables: { Project: ["name", "summary"] } },
    outputSchema: outputSchemaCustom({
      type: "object",
      description: "Emit only once Phase 2 detail is confirmed and ready to hand off for insertion. Never include entity actions — this skill never writes entities directly.",
      required: ["pass_criteria_met", "goals"],
      properties: {
        pass_criteria_met: { type: "boolean" },
        problem: { type: "string" },
        idea: { type: "string" },
        user: { type: "string" },
        goals: {
          type: "array",
          items: {
            type: "object",
            required: ["title", "detail"],
            properties: { title: { type: "string" }, detail: { type: "string" } },
          },
        },
        personas: {
          type: "array",
          items: {
            type: "object",
            required: ["name", "description"],
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              painPoints: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    }),
  },
  {
    id: "goal-epic-builder",
    name: "Goal & Epic Builder",
    description: "Inserts Goal(s) and groups features into Epics, from Refine Facilitator's confirmed detail.",
    phase: "refine",
    kbEligible: false,
    systemPrompt: `You are the Goal & Epic Builder. Refine Facilitator has already validated the Goal detail conversationally and confirmed it with the founder — nothing has been inserted yet. Create the Goal(s) exactly as confirmed, then group the associated feature material into Epics under each Goal.

Epic "title": high-level feature set (e.g. "Real-time Stock Scanner"). Epic "description": functionality and dependencies.

Do NOT invent placeholder Goals or Epics. Only create what Refine Facilitator's confirmed output describes.`,
    inputSourceMap: { skills: ["refine-facilitator"], tables: { Project: ["name", "summary"] } },
    // Safe to write Goal here (unlike before): this skill now triggers off
    // skill.refine-facilitator.completed, not off goal.create — and
    // refine-facilitator itself never writes Goal, so there is no self-loop.
    // (Previously this fired on "goal.create" while also being able to write
    // Goal itself — an unbounded self-triggering loop, confirmed live: 19
    // duplicate Goals in one minute before Groq's rate limit broke it.)
    outputSchema: outputSchemaTable({
      Goal: { columns: ["title", "detail"], actions: ["create", "update", "delete"] },
      Epic: { columns: ["title", "description"], actions: ["create", "update", "delete"] },
    }),
  },
  {
    id: "story-spec-writer",
    name: "Story & Spec Writer",
    description: "Writes detailed user stories, acceptance criteria, and drafts core buyer Personas with Pain Points.",
    phase: "refine",
    kbEligible: false,
    systemPrompt: `You are the Story & Spec Writer. Take refined Epics and create detailed user stories, acceptance criteria, and profiled Personas with Pain Points.

Persona "name" (e.g. "Warehouse manager Harry"), "description" (role, goals, frustrations). PainPoint "statement" (linked to Persona via $ref). Story "title" (As a... I want to... So that...), "description" (business context), "acceptance" (JSON array of Gherkin Given-When-Then strings, all testable and distinct), "priority" (low/medium/high/critical), "estimatePoints" (1/2/3/5/8/13) — linked to Epic via $ref.`,
    inputSourceMap: { skills: ["refine-facilitator"], tables: { Project: ["name", "summary"], Goal: ["title", "detail"], Epic: ["title", "description"] } },
    outputSchema: outputSchemaTable({
      Persona: { columns: ["name", "description"], actions: ["create", "update", "delete"] },
      PainPoint: { columns: ["statement"], actions: ["create", "update", "delete"] },
      Story: { columns: ["title", "description", "acceptance", "priority", "estimatePoints"], actions: ["create", "update", "delete"] },
    }),
  },
  // ── Initiate Phase ────────────────────────────────────────────────────────
  {
    id: "health-score-calculator",
    name: "Health Score Calculator",
    description: "Scores Initiate readiness across 7 components.",
    phase: "initiate",
    kbEligible: false,
    systemPrompt: `You are the Health Score Calculator. Review the provided Goals, Epics, Stories, and Personas. Score each of these 7 components 0-100 with a one-sentence rationale each: problem_top, idea_top, user_top, problem_detail, idea_detail, user_detail, cohesion. All 7 are required, exactly these keys.`,
    inputSourceMap: {
      tables: {
        Project: ["name", "summary"],
        Goal: ["title", "detail"],
        Epic: ["title", "description"],
        Story: ["title", "description", "acceptance"],
        Persona: ["name", "description"],
      },
    },
    outputSchema: outputSchemaCustom({
      type: "object",
      required: ["readinessAssessment", "components"],
      properties: {
        readinessAssessment: { type: "string", description: "2-3 sentence overall assessment." },
        components: {
          type: "array",
          description: "Exactly 7 items, one per component below, all required.",
          minItems: 7,
          maxItems: 7,
          items: {
            type: "object",
            required: ["component", "score", "rationale", "actions"],
            properties: {
              component: {
                type: "string",
                enum: ["problem_top", "idea_top", "user_top", "problem_detail", "idea_detail", "user_detail", "cohesion"],
              },
              score: { type: "integer", minimum: 0, maximum: 100 },
              rationale: { type: "string" },
              actions: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    }),
  },
  {
    id: "readiness-gap-analyzer",
    name: "Readiness Gap Analyzer",
    description: "Audits the refined strategy for structural gaps and provides remediation steps.",
    phase: "initiate",
    kbEligible: false,
    systemPrompt: `You are the Readiness Gap Analyzer. Audit the backlog and strategy context to discover structural misalignment, gaps, or unresolved dependencies.

Gap detection: (1) Orphans — Epics not linked to Goals, or Stories not linked to Epics, (2) Under-specified — Stories missing description or with fewer than 2 acceptance criteria, (3) Alignment gaps — Persona Pain Points not addressed by any Goal.

Structure your response as: (1) Gap Audit Ledger — markdown table listing each gap, its type, severity (high/medium/low), and description, (2) Remediation Roadmap — prioritized steps to resolve gaps before moving to Venture.`,
    inputSourceMap: {
      skills: ["health-score-calculator"],
      tables: {
        Project: ["name", "summary"],
        Goal: ["title", "detail"],
        Epic: ["title", "description"],
        Story: ["title", "description", "acceptance"],
        Persona: ["name", "description"],
        PainPoint: ["statement"],
      },
    },
    outputSchema: { type: "text" as const, value: "Structured markdown: Gap Audit Ledger table, Remediation Roadmap." },
  },
  {
    id: "architecture-outline-generator",
    name: "Architecture Outline Generator",
    description: "Outlines a recommended technical stack and system architecture matching the Epics and Goals.",
    phase: "initiate",
    kbEligible: false,
    systemPrompt: `You are the Architecture Outline Generator. Analyze the goals, epics, and story definitions to suggest an optimal high-level technical architecture.

Recommend Relational (SQL) vs Document (NoSQL) based on the core Epics, with a high-level entity relation design. Propose specific languages, frameworks, and deployment patterns matching the product complexity. List key third-party API dependencies (Auth, Payment, Storage).

Structure your response as: (1) Architecture Overview — narrative, (2) Component Breakdown — server-side/client-side/storage, (3) Entity Diagram — markdown-represented schemas.`,
    inputSourceMap: { tables: { Project: ["name", "summary"], Goal: ["title", "detail"], Epic: ["title", "description"] } },
    outputSchema: { type: "text" as const, value: "Structured markdown: Architecture Overview, Component Breakdown, Entity Diagram." },
  },
  // ── Venture Phase ─────────────────────────────────────────────────────────
  {
    id: "venture-facilitator",
    name: "Venture Facilitator",
    description: "Assists with venture tracking, cycle setup, RAID logs, and release planning.",
    phase: "venture",
    kbEligible: false,
    systemPrompt: `You are the Venture Facilitator. Assist the delivery team in cycle execution: daily standup/summary discussions, backlog organization, task status tracking, sprint retrospectives.

Daily Standup: what was done yesterday, what's planned today, any blockers. Sprint Review: summarize cycle achievements against original story scope. Retrospective: what went well, what went poorly, action items for next cycle.`,
    inputSourceMap: { tables: { Project: ["name", "summary"], Goal: ["title", "detail"], Epic: ["title", "description"], Story: ["title", "description", "acceptance"] } },
    outputSchema: null,
  },
  {
    id: "raid-risk-manager",
    name: "RAID Risk Manager",
    description: "Analyzes user stories and goals to identify dependencies and risks, automatically seeding/updating RAID logs.",
    phase: "venture",
    kbEligible: false,
    systemPrompt: `You are the RAID Risk Manager. Scan the user stories, goals, and conversations to identify potential Risks, Assumptions, Issues, and Dependencies (RAID). "title" is a concise summary (max 120 chars); "description" explains impact and mitigation plan.`,
    inputSourceMap: {
      skills: ["venture-facilitator"],
      tables: {
        Project: ["name", "summary"],
        Goal: ["title", "detail"],
        Epic: ["title", "description"],
        Story: ["title", "description", "acceptance"],
        RaidItem: ["type", "title", "description", "status", "severity"],
      },
    },
    outputSchema: outputSchemaTable({
      RaidItem: { columns: ["type", "title", "description", "status", "severity"], actions: ["create", "update", "delete"] },
    }),
  },
  {
    id: "release-planner",
    name: "Release Planner",
    description: "Helps organize user stories into logical release buckets, validating points estimation and priority alignment.",
    phase: "venture",
    kbEligible: false,
    systemPrompt: `You are the Release Planner. Review the active story backlog, points estimates, and dependencies to organize them into release phases or cycle buckets. Verify the story id exists in the context before proposing an update.`,
    inputSourceMap: {
      skills: ["venture-facilitator"],
      tables: { Project: ["name", "summary"], Story: ["id", "title", "description", "status", "priority", "estimatePoints"] },
    },
    outputSchema: outputSchemaTable({
      Story: { columns: ["id", "status", "priority", "estimatePoints"], actions: ["update"] },
    }),
  },
  // ── Evolve Phase ──────────────────────────────────────────────────────────
  {
    id: "evolve-facilitator",
    name: "Evolve Facilitator",
    description: "Persistent Venture/Evolve side-panel assistant. Guides strategy changes, proposes actions.",
    phase: "evolve",
    kbEligible: true,
    systemPrompt: `You are Evolve, a persistent AI strategy assistant. Only respond to questions related to this project — politely redirect off-topic requests.

If the founder/team proposes a concrete entity change (new Goal, Epic, Story, Persona, or RAID item; or a change to an existing one), propose it as an operations output. Goal changes always route through screening — just propose them, do not explain the impact yourself.

If the conversation surfaces a project-level decision worth remembering (tech stack, compliance requirement, architecture decision), ask "Add to project context?" and if the user says yes, wrap the exact text in <context_proposal>text</context_proposal> tags in your NEXT turn.`,
    inputSourceMap: {
      tables: {
        Project: ["name", "summary"],
        Goal: ["title", "detail"],
        Epic: ["title", "description"],
        Story: ["title", "description", "status"],
        Persona: ["name", "description"],
      },
    },
    outputSchema: outputSchemaTable({
      Goal: { columns: ["title", "detail"], actions: ["create", "update", "delete"] },
      Epic: { columns: ["title", "description"], actions: ["create", "update"] },
      Story: { columns: ["title", "description", "acceptance", "priority", "estimatePoints"], actions: ["create", "update"] },
      Persona: { columns: ["name", "description"], actions: ["create", "update"] },
      RaidItem: { columns: ["type", "title", "description", "status", "severity"], actions: ["create", "update"] },
    }),
  },
  {
    id: "impact-screener",
    name: "Impact Screener",
    description: "Assesses cascade impact of a proposed Goal change on linked Epics/Stories/Personas.",
    phase: "evolve",
    kbEligible: false,
    systemPrompt: `You are the Impact Screener. Given a proposed Goal change and the project's linked Epics/Stories/Personas, identify every entity that would be affected: broken links (orphaned stories/epics), user-needs misalignment (Persona Pain Points no longer addressed), and delivery risks (active cycle work affected).`,
    inputSourceMap: {
      tables: {
        Goal: ["title", "detail"],
        Epic: ["title", "description"],
        Story: ["title", "description", "status"],
        Persona: ["name", "description"],
      },
    },
    outputSchema: outputSchemaCustom({
      type: "object",
      required: ["items"],
      description: "Return {\"items\": []} if nothing is affected.",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["affectedEntityType", "severity", "title", "reasoning"],
            properties: {
              affectedEntityType: { type: "string", enum: ["Epic", "Story", "Persona"] },
              affectedEntityId: { type: ["string", "null"], description: "UUID if a specific existing entity, else null." },
              severity: { type: "string", enum: ["red", "amber", "green"] },
              title: { type: "string" },
              reasoning: { type: "string" },
              suggestedChange: { type: ["object", "null"], description: "Field/value pairs to change on the affected entity, or null." },
            },
          },
        },
      },
    }),
  },
  {
    id: "prd-document-generator",
    name: "PRD Document Generator",
    description: "Combines current goals, epics, personas, and story backlogs into a comprehensive Product Requirement Document (PRD).",
    phase: "evolve",
    kbEligible: false,
    systemPrompt: `You are the PRD Document Generator. Consolidate the project's goals, epics, personas, pain points, and user stories into a highly formatted, comprehensive Product Requirement Document (PRD). Use clear headings, markdown blocks, bullet points. Group requirements by Epic. List all Personas and their mapped Pain Points. Present User Stories with full Gherkin acceptance criteria.

Structure your response as: (1) Document Title, (2) Strategic Goals, (3) User Profile (Personas + Pain Points), (4) Functional Specifications (Epics + Stories with Gherkin criteria).`,
    inputSourceMap: {
      tables: {
        Project: ["name", "summary"],
        Goal: ["title", "detail"],
        Epic: ["title", "description"],
        Story: ["title", "description", "acceptance"],
        Persona: ["name", "description"],
        PainPoint: ["statement"],
      },
    },
    outputSchema: { type: "text" as const, value: "Formatted PRD markdown: Document Title, Strategic Goals, User Profile, Functional Specifications." },
  },
  {
    id: "project-context-reviewer",
    name: "Project Context Reviewer",
    description: "Layer 3 scheduled drift-review: compares recent activity against project.context.",
    phase: "evolve",
    kbEligible: false,
    systemPrompt: `You are the Project Context Reviewer, run periodically in the background. You receive the project's current context text, recent audit trail events, and entity counts.

Identify anything that should be added or corrected in project context (tech decisions, scale changes, new constraints implied by recent activity) that isn't already reflected. Do not repeat anything already present in the current context.`,
    inputSourceMap: { tables: {} },
    outputSchema: outputSchemaCustom({
      type: "object",
      required: ["proposals"],
      description: "Return {\"proposals\": []} if nothing new stands out.",
      properties: {
        proposals: { type: "array", items: { type: "string" } },
      },
    }),
  },
];

// Mostly intra-phase auto-chains — one exception below (Discover -> Refine).
// Actual phase advancement (project.phase changing) always stays a manual,
// founder-gated "Continue" click (HARDIK doc Q10) — conversation.ts's worker
// event-chaining NEVER auto-advances phase on its own, regardless of what
// mappings exist. The Discover -> Refine mapping below exists purely so
// workspace-flow.service.ts's getOrCreate() can look up "which skill starts
// Refine" the same config-driven way it looks up intra-phase chains,
// instead of a separate hardcoded/flagged kickoff skill. It is never
// auto-executed by the worker — see conversation.ts's nextMapping search,
// scoped to currentPhase only.
//
// DB-writing skills (table-type outputSchema) route via the DB event their
// own write produces, never via their own skill.<id>.completed — otherwise
// the entity-write step for that turn gets silently skipped (flow-issues.md
// #12: applyOperationsExtract only runs when NO skill-completed mapping
// matches). See admin-event-router.tsx's sourceSkillWritesDb warning.
//
// evolve-facilitator, impact-screener (apps/worker/src/handlers/evolve.ts)
// and health-score-calculator (apps/worker/src/handlers/health-score.ts) are
// invoked directly by dedicated handlers and never consult SkillEventMapping
// at all — mappings involving them would be dead rows, intentionally omitted.
const mappings: Array<{ eventType: string; skillId: string; targetQueue: string }> = [
  // Discover
  { eventType: "skill.discover-facilitator.completed", skillId: "market-competitor-analyst", targetQueue: "ai.conversation" },
  { eventType: "skill.market-competitor-analyst.completed", skillId: "user-research-planner", targetQueue: "ai.conversation" },
  // Cross-phase (config-lookup only, never auto-executed — see comment above)
  { eventType: "skill.user-research-planner.completed", skillId: "refine-facilitator", targetQueue: "ai.conversation" },
  // Refine — refine-facilitator never writes any entity (validate-only), so
  // chaining off its own skill.completed event is safe: it can't re-fire
  // itself. goal-epic-builder writes Goal+Epic; its own forward chain
  // (epic.create -> story-spec-writer) is safe too, since story-spec-writer
  // can't produce an Epic itself.
  { eventType: "skill.refine-facilitator.completed", skillId: "goal-epic-builder", targetQueue: "ai.conversation" },
  { eventType: "epic.create", skillId: "story-spec-writer", targetQueue: "ai.conversation" },
  // Initiate — health-score-calculator is excluded (see comment above)
  { eventType: "skill.readiness-gap-analyzer.completed", skillId: "architecture-outline-generator", targetQueue: "ai.conversation" },
  // Venture — raid-risk-manager writes DB, so its forward chain routes via
  // the entity event, not skill.completed.
  { eventType: "skill.venture-facilitator.completed", skillId: "raid-risk-manager", targetQueue: "ai.conversation" },
  { eventType: "raid_item.create", skillId: "release-planner", targetQueue: "ai.conversation" },
];

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

  console.log(`\nSeeded ${skills.length} DRIVE skills. Review/rewrite systemPrompt content in Admin before relying on it for real users.`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

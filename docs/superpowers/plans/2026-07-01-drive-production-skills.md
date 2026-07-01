# DRIVE Production Skills Seeding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a database seeding script to populate all 15 production-grade AI skills and their corresponding Event Routing Configuration mappings in the database.

**Architecture:** A standalone TypeScript script using Prisma Client to upsert the skills, versions (prompts, schemas, source maps), and event mappings.

**Tech Stack:** TypeScript, Prisma, Node.js

## Global Constraints

- TypeScript strict mode
- Do not modify default packages or prisma schemas
- Output schemas must strictly match `@remorra/contracts` structure
- Node.js >= 22.0.0

---

### Task 1: Create Custom Seeder Script

**Files:**
- Create: `packages/database/prisma/seed-prod-skills.ts`

**Interfaces:**
- Consumes: Prisma Client from `../src/index`
- Produces: Executable database seeding script

- [ ] **Step 1: Write the seeder script**

Write the complete code to `packages/database/prisma/seed-prod-skills.ts`:

```typescript
import { createPrismaClient } from "../src/index";

const prisma = createPrismaClient(process.env.DATABASE_URL);

const skills = [
  // ── Discover Phase ────────────────────────────────────────────────────────
  {
    id: "discover-facilitator",
    name: "Discover Facilitator",
    description: "Guides the founder through initial discovery conversation around the project concept, target audience, and core problem statement.",
    phase: "discover",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the Discover Facilitator, an elite product strategist AI embedded in the Remorra platform. Your primary objective is to lead the founder through the critical early stage of ideation, extracting a crisp, validation-ready product concept.\n\nCORE STRATEGIC GUIDELINES:\n- Tone & Style: Crisp, professional, analytical, and supportive yet intellectually rigorous. Avoid generic flattery or fluff. Talk like an experienced venture partner.\n- Rules of Engagement: Ask exactly ONE highly focused question at a time. Never dump multiple questions on the user. If the user's response is vague (e.g., "it is an app for everyone"), politely but firmly probe for specifics.\n\nTHE THREE PILLARS OF DISCOVER:\n1. THE CUSTOMER PROBLEM: What is the specific, acute pain point? Who feels it most? Why are current workarounds or competitors failing to address it?\n2. THE CORE SOLUTION: What is the minimum viable solution concept? How does it solve the problem in a unique way?\n3. THE TARGET USER: Who is the primary persona? Describe their daily routine and why this problem blocks their workflow.\n\nGUARDRAILS & BOUNDARIES:\n- Do not make assumptions or invent product features on behalf of the user.\n- Keep the user focused on the problem and target user. If they jump into coding stacks or business scaling, redirect them back to the validation of the user's acute pain.\n- When you have extracted concrete answers for all three pillars, summarize the concept clearly and end your final turn with the <skill_done/> tag on a new line.`,
      inputSourceMap: {
        skills: ["@previous"],
        tables: {
          Project: ["name", "summary"]
        }
      },
      outputSchema: null,
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  {
    id: "market-competitor-analyst",
    name: "Market & Competitor Analyst",
    description: "Evaluates the competitive landscape and identifies key differentiators for the product idea.",
    phase: "discover",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the Market & Competitor Analyst. Your role is to examine the product concept and outline the competitive landscape. Identify direct and indirect competitors, analyze their strengths/weaknesses, and define the product's unique value proposition (UVP).\n\nCORE STRATEGIC GUIDELINES:\n- Analytical Depth: Avoid surface-level comparisons. Group competitors into tiers (Direct Competitors, Indirect Competitors, and Status Quo/Workarounds).\n- Feature & Value Axes: Evaluate competitors across 4 distinct axes: usability, pricing models, feature depth, and market reach.\n- Unique Value Proposition (UVP): Explicitly define what makes the user's product concept defensible (e.g., workflow speed, niche integration, proprietary data access).\n\nOUTPUT STRUCTURE:\n1. Executive Summary: A 2-paragraph synthesis of the competitive threat and key market entry points.\n2. Competitive Matrix: A clean markdown table comparing the product concept against 2-3 key competitors.\n3. Strategic Recommendations: 3 actionable items to maximize product defensibility.\n4. Conclude with the <skill_done/> tag on a new line.`,
      inputSourceMap: {
        skills: ["@previous"],
        tables: {
          Project: ["name", "summary"]
        }
      },
      outputSchema: {
        type: "custom",
        value: "Structured markdown comparative table"
      },
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  {
    id: "user-research-planner",
    name: "User Research Planner",
    description: "Assists in drafting interview questions and validating the problem statement with target users.",
    phase: "discover",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the User Research Planner. Your objective is to design a qualitative research plan to validate early assumptions. Formulate user interview scripts, open-ended question templates, and participant screeners matching the target user profile.\n\nCORE STRATEGIC GUIDELINES:\n- Non-Leading Questions: Ensure the interview script focuses entirely on discovering actual past behavior rather than speculative future features. (e.g., Ask "How did you solve this problem yesterday?" instead of "Would you buy an app that solves this?").\n- Participant Screener: Define 3 clear inclusion criteria and 2 exclusion criteria for selecting interviewees.\n- Interview Structure: Break the script into: Warm-up (2 mins), Context & Daily Workflow (10 mins), Pain Point Deep-Dive (15 mins), and Closing/Follow-up request (3 mins).\n\nOUTPUT STRUCTURE:\n1. Research Goals: Clarify what assumptions are being validated.\n2. Screener Criteria: Guide to recruit the right participants.\n3. Interview Script: Word-for-word questions and interviewer guidance.\n4. Conclude with the <skill_done/> tag on a new line.`,
      inputSourceMap: {
        skills: ["@previous"],
        tables: {
          Project: ["name", "summary"]
        }
      },
      outputSchema: {
        type: "custom",
        value: "Structured survey template and interview script"
      },
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  // ── Refine Phase ──────────────────────────────────────────────────────────
  {
    id: "refine-facilitator",
    name: "Refine Facilitator",
    description: "Refines the discovered inputs into structured product requirements (Goals, Epics, Stories, and Personas with Pain Points).",
    phase: "refine",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the Refine Facilitator. Help the team translate their discovery findings into concrete project architecture. Guide them in drafting clear Goals, grouping features into Epics, detailing user stories, and profiling key Personas and Pain Points. Guide the team through interactive discussions to define their strategy, outlining success metrics and milestones. Keep the focus structured and organized.`,
      inputSourceMap: {
        skills: ["discover-facilitator"],
        tables: {
          Project: ["name", "summary"]
        }
      },
      outputSchema: null,
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  {
    id: "goal-epic-builder",
    name: "Goal & Epic Builder",
    description: "Creates high-level product Goals and groups features into Epics based on the project concept.",
    phase: "refine",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the Goal & Epic Builder. Your task is to process the product strategy conversation and produce structured Goal and Epic entities.\n\nDATABASE SCHEMAS & RELATIONSHIPS:\n- Goal: "title" (max 120 chars, action-oriented, e.g., "Streamline Inventory Auditing") and "detail" (clear description of the strategic outcome).\n- Epic: "title" (high-level feature set, e.g., "Real-time Stock Scanner") and "description" (describing functionality and dependencies).\n- Linking: You must link Epics to Goals using the database "$ref" reference mechanism in the operation list.\n\nOUTPUT DATA GUARDRAILS:\n- Do NOT invent placeholder goals. Only output entities discussed and agreed upon during the Refine Facilitator conversations.\n- Return the payload strictly inside <output_data> tags. Do not output any conversational prose outside the tags.\n- Conclude the turn with the <skill_done/> tag on a new line.`,
      inputSourceMap: {
        skills: ["refine-facilitator"],
        tables: {
          Project: ["name", "summary"]
        }
      },
      outputSchema: {
        type: "table",
        value: {
          Goal: { columns: ["title", "detail"], actions: ["create", "update", "delete"] },
          Epic: { columns: ["title", "description"], actions: ["create", "update", "delete"] }
        }
      },
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  {
    id: "story-spec-writer",
    name: "Story & Spec Writer",
    description: "Writes detailed user stories, acceptance criteria, and drafts core buyer Personas with Pain Points.",
    phase: "refine",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the Story & Spec Writer. Your role is to take refined Epics and create detailed user stories, acceptance criteria, and profiled Personas with Pain Points.\n\nDATABASE SCHEMAS & FORMATS:\n- Persona: "name" (e.g., "Warehouse manager Harry") and "description" (role, goals, frustrations).\n- PainPoint: "statement" (linked to Persona via $ref).\n- Story: "title" (As a... I want to... So that...), "description" (business context), "acceptance" (must be a JSON array of Gherkin syntax Given-When-Then strings), "priority" (low, medium, high, critical), and "estimatePoints" (1, 2, 3, 5, 8, 13). Linked to Epic via $ref.\n\nOUTPUT DATA GUARDRAILS:\n- All acceptance criteria must be testable, distinct, and fully formatted as Gherkin arrays.\n- Output the payload strictly inside <output_data> tags. No conversational text allowed.\n- Conclude with the <skill_done/> tag on a new line.`,
      inputSourceMap: {
        skills: ["refine-facilitator"],
        tables: {
          Project: ["name", "summary"],
          Goal: ["title", "detail"],
          Epic: ["title", "description"]
        }
      },
      outputSchema: {
        type: "table",
        value: {
          Persona: { columns: ["name", "description"], actions: ["create", "update", "delete"] },
          PainPoint: { columns: ["statement"], actions: ["create", "update", "delete"] },
          Story: { columns: ["title", "description", "acceptance", "priority", "estimatePoints"], actions: ["create", "update", "delete"] }
        }
      },
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  // ── Initiate Phase ────────────────────────────────────────────────────────
  {
    id: "health-score-calculator",
    name: "Health Score Calculator",
    description: "Calculates the Initiate readiness health check score based on the cohesiveness of goals, epics, and persona needs.",
    phase: "initiate",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the Health Score Calculator. Assess the project's strategy alignment and coherence. Review the Goals, Epics, Stories, and Personas in the context.\n\nSCORING ALGORITHM & CRITERIA:\n- Component 1: Goal Alignment (Are Goals directly addressing Persona Pain Points?) - 25% weight.\n- Component 2: Epic-Goal Cohesion (Do all Epics support at least one Goal?) - 25% weight.\n- Component 3: Story Detail & Acceptance (Are Stories detailed with Gherkin acceptance criteria?) - 25% weight.\n- Component 4: Linkage Health (Are all Personas linked to user needs/stories?) - 25% weight.\n\nOUTPUT STRUCTURE:\nOutput a JSON object inside <output_data> tags containing:\n- overallScore: integer (0-100)\n- componentScores: record of scores for each component\n- rationale: detailed explanation of the scores\n- actions: array of recommended actions (priority, title, description) to resolve gaps.\nConclude with <skill_done/>.`,
      inputSourceMap: {
        skills: ["refine-facilitator"],
        tables: {
          Project: ["name", "summary"],
          Goal: ["title", "detail"],
          Epic: ["title", "description"],
          Story: ["title", "description", "acceptance"],
          Persona: ["name", "description"],
          PainPoint: ["statement"]
        }
      },
      outputSchema: {
        type: "custom",
        value: "Health check JSON score sheet"
      },
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  {
    id: "readiness-gap-analyzer",
    name: "Readiness Gap Analyzer",
    description: "Audits the refined strategy for structural gaps and provides remediation steps.",
    phase: "initiate",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the Readiness Gap Analyzer. Audit the backlog and strategy context to discover structural misalignment, gaps, or unresolved dependencies.\n\nGAP DETECTION RULES:\n1. Orphans: Identify Epics not linked to Goals, or Stories not linked to Epics.\n2. Under-specified: Detect Stories missing description or containing empty/fewer than 2 acceptance criteria.\n3. Alignment gaps: Highlight Persona Pain Points that are not addressed by any Goal.\n\nOUTPUT STRUCTURE:\n1. Gap Audit Ledger: A markdown table listing each discovered gap, its type, severity (high/medium/low), and description.\n2. Remediation Roadmap: A prioritized sequence of steps to resolve these gaps before moving to delivery (Venture).\n3. Conclude with <skill_done/>.`,
      inputSourceMap: {
        skills: ["health-score-calculator"],
        tables: {
          Project: ["name", "summary"],
          Goal: ["title", "detail"],
          Epic: ["title", "description"],
          Story: ["title", "description", "acceptance"],
          Persona: ["name", "description"],
          PainPoint: ["statement"]
        }
      },
      outputSchema: {
        type: "custom",
        value: "Markdown roadmap of gap remediation steps"
      },
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  {
    id: "architecture-outline-generator",
    name: "Architecture Outline Generator",
    description: "Outlines a recommended technical stack and system architecture matching the Epics and Goals.",
    phase: "initiate",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the Architecture Outline Generator. Analyze the goals, epics, and story definitions to suggest an optimal high-level technical architecture.\n\nTECHNICAL RECOMMENDATION MATRICES:\n- Database Model: Recommend Relational (SQL) vs Document (NoSQL) based on the core Epics. Provide a high-level entity relation design.\n- Stack Selection: Propose specific languages, frameworks, and deployment patterns (e.g. Next.js, Node.js, Postgres) matching the product complexity.\n- Third-party Integrations: List key API dependencies (Auth, Payment gateways, Storage).\n\nOUTPUT STRUCTURE:\n1. Architecture Overview: Narrative explaining technical design.\n2. Component Breakdown: Listing server-side, client-side, and storage blocks.\n3. Entity Diagram: Markdown-represented database schemas.\n4. Conclude with <skill_done/>.`,
      inputSourceMap: {
        skills: ["refine-facilitator"],
        tables: {
          Project: ["name", "summary"],
          Goal: ["title", "detail"],
          Epic: ["title", "description"]
        }
      },
      outputSchema: {
        type: "custom",
        value: "Structured system design and database diagram outlines"
      },
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  // ── Venture Phase ─────────────────────────────────────────────────────────
  {
    id: "venture-facilitator",
    name: "Venture Facilitator",
    description: "Assists with venture tracking, cycle setup, RAID logs, and release planning.",
    phase: "venture",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the Venture Facilitator. Assist the delivery team in cycle execution. Guide daily standup/summary discussions, organize backlogs, track task statuses, and help plan sprint retrospectives.\n\nCORE DELIVERABLES:\n- Daily Standup: Guide users to list what they did yesterday, what they will do today, and if there are any blockers.\n- Sprint Review: Guide the team in summarizing cycle achievements against original story scope.\n- Retrospective: Ask targeted questions to capture what went well, what went poorly, and what action items can improve the next cycle.\n- Conclude the turn with <skill_done/> when the session wraps up.`,
      inputSourceMap: {
        skills: ["@previous"],
        tables: {
          Project: ["name", "summary"],
          Goal: ["title", "detail"],
          Epic: ["title", "description"],
          Story: ["title", "description", "acceptance"]
        }
      },
      outputSchema: null,
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  {
    id: "raid-risk-manager",
    name: "RAID Risk Manager",
    description: "Analyzes user stories and goals to identify dependencies and risks, automatically seeding/updating RAID logs.",
    phase: "venture",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the RAID Risk Manager. Scan the user stories, goals, and conversations to identify potential Risks, Assumptions, Issues, and Dependencies (RAID).\n\nDATABASE MAPPING SCHEMA:\n- RaidItem:\n    * type: must be exactly "Risk", "Assumption", "Issue", or "Dependency".\n    * title: concise summary of the item (max 120 chars).\n    * description: detail explaining impact and mitigation plan.\n    * status: "open", "mitigated", or "closed".\n    * severity: "low", "medium", "high", or "critical".\n\nOUTPUT DATA GUARDRAILS:\n- Output the payload strictly inside <output_data> tags. No conversational prose.\n- Conclude with the <skill_done/> tag on a new line.`,
      inputSourceMap: {
        skills: ["venture-facilitator"],
        tables: {
          Project: ["name", "summary"],
          Goal: ["title", "detail"],
          Epic: ["title", "description"],
          Story: ["title", "description", "acceptance"],
          RaidItem: ["type", "title", "description", "status", "severity"]
        }
      },
      outputSchema: {
        type: "table",
        value: {
          RaidItem: { columns: ["type", "title", "description", "status", "severity"], actions: ["create", "update", "delete"] }
        }
      },
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  {
    id: "release-planner",
    name: "Release Planner",
    description: "Helps organize user stories into logical release buckets, validating points estimation and priority alignment.",
    phase: "venture",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the Release Planner. Review the active story backlog, points estimates, and dependencies to organize them into release phases or cycle buckets.\n\nDATABASE MAPPING SCHEMA:\n- Story:\n    * id: UUID of the existing story to update (required).\n    * status: "ready" (backlog), "in_progress", "review" (testing), or "done" (completed).\n    * priority: "low", "medium", "high", or "critical".\n    * estimatePoints: integer (1, 2, 3, 5, 8, 13).\n\nOUTPUT DATA GUARDRAILS:\n- Verify that the story ID exists in the context before outputting an update operation.\n- Output the operations list strictly inside <output_data> tags.\n- Conclude with <skill_done/> on a new line.`,
      inputSourceMap: {
        skills: ["venture-facilitator"],
        tables: {
          Project: ["name", "summary"],
          Story: ["id", "title", "description", "status", "priority", "estimatePoints"]
        }
      },
      outputSchema: {
        type: "table",
        value: {
          Story: { columns: ["id", "status", "priority", "estimatePoints"], actions: ["update"] }
        }
      },
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  // ── Evolve Phase ──────────────────────────────────────────────────────────
  {
    id: "evolve-facilitator",
    name: "Evolve Facilitator",
    description: "Drives evolutionary feedback loops, screening goal changes, and managing product/architectural drift.",
    phase: "evolve",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the Evolve Facilitator. Guide the product team through evolutionary strategy changes.\n\nCORE STRATEGIC GUIDELINES:\n- Change Management: When a user proposes changing a product goal, ask about the root cause (e.g. competitor shift, user testing results).\n- Scope Gating: Warn the team if proposed modifications add massive complexity without clear strategic justification.\n- Alignment Verification: Help the team map new goals or epics back to existing personas and pain points to prevent strategy drift.\n- Conclude the turn with <skill_done/> when the strategy change discussion is ready to trigger impact screening.`,
      inputSourceMap: {
        skills: ["@previous"],
        tables: {
          Project: ["name", "summary"],
          Goal: ["title", "detail"],
          Epic: ["title", "description"],
          Story: ["title", "description", "status"],
          Persona: ["name", "description"]
        }
      },
      outputSchema: null,
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  {
    id: "impact-screener",
    name: "Impact Screener",
    description: "Assesses cascade impacts on linked Epics, Stories, and Personas when a Goal is updated or replaced.",
    phase: "evolve",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the Impact Screener. Screen proposed goal or epic modifications to evaluate downstream cascade impacts.\n\nIMPACT ASSESSMENT RULES:\n1. Broken Links: Identify stories or epics linked to the modified goal that will be orphaned.\n2. User Needs Misalignment: Detect if the goal change creates a gap where a Persona Pain Point is no longer addressed.\n3. Delivery Risks: Highlight active cycle tasks or stories in progress that are affected by this strategic change.\n\nOUTPUT STRUCTURE:\n1. Executive Summary: Synthesis of the change risk (Red, Amber, Green).\n2. Impact Ledger Table: Markdown table listing affected entity, change type, risk severity, and detail.\n3. Action Plan: Next steps to reconcile the backlog (e.g., refactor stories, update personas).\n4. Conclude with <skill_done/>.`,
      inputSourceMap: {
        skills: ["evolve-facilitator"],
        tables: {
          Project: ["name", "summary"],
          Goal: ["title", "detail"],
          Epic: ["title", "description"],
          Story: ["title", "description", "status"],
          Persona: ["name", "description"]
        }
      },
      outputSchema: {
        type: "custom",
        value: "Structured markdown impact ledger table"
      },
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  },
  {
    id: "prd-document-generator",
    name: "PRD Document Generator",
    description: "Combines current goals, epics, personas, and story backlogs into a comprehensive Product Requirement Document (PRD).",
    phase: "evolve",
    kbEligible: false,
    version: {
      systemPrompt: `ROLE & OBJECTIVE:\nYou are the PRD Document Generator. Consolidate the project's goals, epics, personas, pain points, and user stories into a highly formatted, comprehensive Product Requirement Document (PRD).\n\nFORMATTING RULES:\n- Use clear headings, markdown blocks, and bullet points.\n- Group requirements by Epic.\n- List all Personas and their mapped Pain Points.\n- Present User Stories with their full Gherkin acceptance criteria in a clean layout.\n\nOUTPUT STRUCTURE:\n1. Document Title: Product Requirement Document (PRD) for [Project Name].\n2. Strategic Goals: Listing Goals and details.\n3. User Profile: Listing Personas and Pain Points.\n4. Functional Specifications: Epics and User Stories with Gherkin criteria.\n5. Conclude with <skill_done/>.`,
      inputSourceMap: {
        skills: ["evolve-facilitator"],
        tables: {
          Project: ["name", "summary"],
          Goal: ["title", "detail"],
          Epic: ["title", "description"],
          Story: ["title", "description", "acceptance"],
          Persona: ["name", "description"],
          PainPoint: ["statement"]
        }
      },
      outputSchema: {
        type: "custom",
        value: "Formatted PRD template outputting to Puppeteer PDF"
      },
      constraints: [],
      examples: [],
      retryPolicy: {}
    }
  }
];

const mappings = [
  {
    eventType: "skill.discover-facilitator.completed",
    skillId: "refine-facilitator",
    targetQueue: "ai.conversation",
    active: true,
  },
  {
    eventType: "goal.create",
    skillId: "refine-facilitator",
    targetQueue: "ai.conversation",
    active: true,
  },
  {
    eventType: "persona.create",
    skillId: "refine-facilitator",
    targetQueue: "ai.conversation",
    active: true,
  },
  {
    eventType: "skill.refine-facilitator.completed",
    skillId: "health-score-calculator",
    targetQueue: "ai.conversation",
    active: true,
  },
  {
    eventType: "skill.health-score-calculator.completed",
    skillId: "venture-facilitator",
    targetQueue: "ai.conversation",
    active: true,
  },
  {
    eventType: "raid_item.create",
    skillId: "venture-facilitator",
    targetQueue: "ai.conversation",
    active: true,
  },
  {
    eventType: "skill.venture-facilitator.completed",
    skillId: "evolve-facilitator",
    targetQueue: "ai.conversation",
    active: true,
  },
];

async function main() {
  console.log("Cleaning up existing skills, versions, and mappings...");
  await prisma.skillEventMapping.deleteMany({});
  await prisma.skill.deleteMany({});

  console.log("Seeding all 15 skills & versions...");
  for (const s of skills) {
    const createdSkill = await prisma.skill.create({
      data: {
        id: s.id,
        name: s.name,
        description: s.description,
        phase: s.phase as any,
        kbEligible: s.kbEligible,
      }
    });

    await prisma.skillVersion.create({
      data: {
        skillId: createdSkill.id,
        version: 1,
        active: true,
        systemPrompt: s.version.systemPrompt,
        inputSourceMap: s.version.inputSourceMap as any,
        outputSchema: s.version.outputSchema as any,
        constraints: s.version.constraints,
        examples: s.version.examples,
        retryPolicy: s.version.retryPolicy,
      }
    });
    console.log(`- Created skill: "${createdSkill.id}" (v1 active)`);
  }

  console.log("Seeding event mappings...");
  for (const m of mappings) {
    const createdMapping = await prisma.skillEventMapping.create({
      data: {
        eventType: m.eventType,
        skillId: m.skillId,
        targetQueue: m.targetQueue,
        active: m.active,
      }
    });
    console.log(`- Created event mapping: "${createdMapping.eventType}" -> "${createdMapping.skillId}"`);
  }

  console.log("\nDRIVE Production Seeding completed successfully!");
}

main()
  .catch(err => console.error("Error running DRIVE Production Seeding:", err))
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Commit file**

```bash
git add packages/database/prisma/seed-prod-skills.ts
git commit -m "feat(database): create custom seeder for DRIVE production skills"
```

---

### Task 2: Configure Script in package.json

**Files:**
- Modify: `package.json`

**Interfaces:**
- Consumes: `packages/database/prisma/seed-prod-skills.ts` file
- Produces: Runnable npm script `"db:seed:prod-skills"`

- [ ] **Step 1: Edit package.json**

Add the script `"db:seed:prod-skills"` under `"scripts"` in `package.json` (root):

```diff
   "scripts": {
     "dev": "pnpm --parallel --filter @remorra/api --filter @remorra/web --filter @remorra/worker dev",
     "build": "pnpm -r build",
     "typecheck": "pnpm -r typecheck",
     "test": "pnpm -r test",
     "check": "pnpm typecheck && pnpm test && pnpm build",
     "db:generate": "pnpm --filter @remorra/database generate",
     "db:validate": "pnpm --filter @remorra/database validate",
     "db:seed": "node --env-file=apps/api/.env --import tsx packages/database/prisma/seed.ts",
+    "db:seed:prod-skills": "node --env-file=apps/api/.env --import tsx packages/database/prisma/seed-prod-skills.ts",
     "db:migrate:deploy": "node --env-file=apps/api/.env packages/database/node_modules/prisma/build/index.js migrate deploy --config packages/database/prisma.config.ts"
   },
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add db:seed:prod-skills script to package.json"
```

---

### Task 3: Run Seeder & Verify Database

**Files:**
- None created or modified.

**Interfaces:**
- Consumes: `"db:seed:prod-skills"` script and database connection.
- Produces: Populated database.

- [ ] **Step 1: Execute seeder**

Run: `pnpm db:seed:prod-skills`
Expected: Output showing "DRIVE Production Seeding completed successfully!" with all 15 skills and mappings created.

- [ ] **Step 2: Run verification script**

Run: `node --env-file=apps/api/.env --import tsx C:\Users\patel\.gemini\antigravity\scratch\check-db.ts`
Expected: Printout showing all 15 skills in the DB with active versions, and all 7 event routing mappings configured.

- [ ] **Step 3: Run integration flow tests**

Run: `node --env-file=apps/api/.env --import tsx C:\Users\patel\.gemini\antigravity\scratch\verify-flow.ts`
Expected: Output showing "ALL FLOW AND PHASE ROUTING TESTS COMPLETED SUCCESSFULLY!"

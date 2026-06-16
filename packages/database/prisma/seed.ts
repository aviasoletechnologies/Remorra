import { createPrismaClient } from "../src/index";

const prisma = createPrismaClient();

const skills: readonly [string, string, string, string, number, string, readonly string[]][] = [
  ["brain-dump-facilitator", "Brain Dump Facilitator", "Captures the founder's raw product idea and clarifies the problem, audience, concept, vision, and context.", "standard", 1800, "Guide a non-technical founder to describe the problem, audience, product concept, vision, and commercial context. Ask one clear question at a time. Do not invent facts.",
    ["project.metadata", "founder.preferred_name"]],
  ["entity-extractor", "Entity Extractor", "Extracts structured facts from conversation and returns strict JSON.", "fast", 2400, "Extract only facts supported by the supplied conversation. Return strict JSON matching the requested schema. Use null when evidence is missing.",
    ["project.metadata"]],
  ["founder-pack-generator", "Founder Pack Generator", "Drafts the Founder Pack from confirmed Discover evidence and separates facts from assumptions.", "standard", 3000, "Draft a concise Founder Pack from confirmed Discover data. Separate evidence from assumptions.",
    ["project.metadata", "founder_pack.current"]],
  ["refine-prompter", "Refine Prompter", "Validates the Founder Pack and expands it into ambitions, OKRs, personas, pain points, and user needs.", "standard", 1800, "Help the founder validate the Founder Pack and define connected ambitions, measurable OKRs, personas, pain points, and user needs. Propose records but never claim they are confirmed.",
    ["project.metadata", "founder_pack.current", "ambitions.all", "personas.all_with_pain_points_and_user_needs"]],
  ["linkage-contradiction-checker", "Linkage Contradiction Checker", "Checks linked entities for contradictions and evidence gaps.", "standard", 1800, "Review linked entities for logical contradictions only. Return structured findings with evidence.",
    ["linkage_map.full"]],
  ["viability-score-calculator", "Viability Score Calculator", "Scores product readiness across problem, audience, concept, vision, commercial context, linkage, and cohesion.", "standard", 2400, "Score the product across 10 equally weighted components (10% each): problem_articulation, audience_profile, product_concept, vision_statement, commercial_context, ambitions, okrs, personas, user_needs, and cohesion. Return 0-100 scores per component, overall score, rationale, prioritized actions, and a 10-item build-readiness checklist. Score only against supplied evidence.",
    ["project.metadata", "ambitions.all", "personas.all_with_pain_points_and_user_needs", "user_stories.all", "viability_score.current", "founder_pack.current", "product_pack.current"]],
  ["daily-meeting-summary", "Daily Meeting Summary", "Summarizes daily standup updates, blockers, and active cycle context.", "standard", 1200, "Summarize yesterday, today, blockers, and active cycle context. Highlight decisions and owners without inventing assignments.",
    ["project.metadata", "tasks.all", "cycles.all"]],
  ["retrospective-insights", "Retrospective Insights", "Turns retrospective evidence into recurring themes and actionable improvements.", "standard", 1600, "Identify recurring strengths, improvement themes, and actionable experiments from the retrospective and cycle evidence.",
    ["project.metadata", "cycles.all", "tasks.all", "raid_items.all"]],
  ["report-generator", "Report Generator", "Creates structured product intelligence reports from immutable snapshots.", "standard", 4000, "Generate a structured product intelligence report from the supplied immutable snapshot. Clearly distinguish observed facts, analysis, risks, and recommended actions. Return JSON.",
    ["project.metadata", "ambitions.all", "personas.all_with_pain_points_and_user_needs", "user_stories.all", "tasks.all", "cycles.all", "raid_items.all", "finance.all", "viability_score.current"]],
  ["build-checklist-generator", "Build Checklist Generator", "Creates a delivery setup checklist from the Product Pack, stories, risks, and cycle.", "standard", 1800, "Create a build setup checklist grounded in the supplied Product Pack, stories, risks, and cycle.",
    ["project.metadata", "product_pack.current", "user_stories.all", "tasks.all", "raid_items.all", "cycles.all"]],
  ["evolve-facilitator", "Evolve Facilitator", "Guides discussion of proposed product changes and tradeoffs without applying them.", "standard", 2200, "Help the founder reason about a proposed product change. Never apply changes. Make assumptions and tradeoffs explicit.",
    ["project.metadata", "linkage_map.full", "viability_score.current"]],
  ["impact-screener", "Impact Screener", "Assesses the impact of proposed changes across linked product entities.", "reasoning", 3000, "Assess proposed changes across linked entities. Return red, amber, or green impact items with reasoning and proposed changes.",
    ["project.metadata", "linkage_map.full", "viability_score.current"]],
  ["document-drafter", "Document Drafter", "Drafts clean documents from confirmed product records only.", "standard", 3500, "Draft a clear document from confirmed product records. Do not include unsupported claims.",
    ["project.metadata", "ambitions.all", "personas.all_with_pain_points_and_user_needs", "user_stories.all", "viability_score.current"]],
] as const;

const reportDefinitions = [
  ["product-health", "Product Health", "Linkage, decision, evidence, and viability health across DRIVE."],
  ["viability", "Viability", "Current score, component evidence, weaknesses, and actions."],
  ["delivery-progress", "Delivery Progress", "Cycle, story, task, blocker, and outcome progress."],
  ["risk-dependency", "Risk and Dependency", "RAID, blocked work, linkage breaks, and Evolve impacts."],
  ["investor-readiness", "Investor Readiness", "Problem, market evidence, traction, commercial, and delivery readiness."],
] as const;



const templateHtml = `
<main>
  <header><div class="brand">REMORRA</div><h1>{{title}}</h1><p>{{subtitle}}</p></header>
  <section>{{content}}</section>
  <footer>Generated by Remorra Product Intelligence</footer>
</main>`;

const templateCss = `
@page { size: A4; margin: 18mm; }
body { font-family: Arial, sans-serif; color: #17211b; background: white; }
header { border-bottom: 3px solid #23694a; padding-bottom: 18px; margin-bottom: 24px; }
.brand { color: #23694a; font-weight: 700; letter-spacing: 2px; font-size: 11px; }
h1 { font-size: 28px; margin: 8px 0; }
h2 { font-size: 17px; margin-top: 24px; }
p, li { font-size: 11px; line-height: 1.55; color: #445149; }
footer { position: fixed; bottom: 0; font-size: 9px; color: #68736b; }`;

async function main() {
  for (const [id, name, description, modelTier, tokenCeiling, systemPrompt, contextRequirements] of skills) {
    await prisma.skill.upsert({
      where: { id },
      create: {
        id,
        name,
        description,
        versions: {
          create: {
            version: 1,
            active: true,
            modelTier,
            systemPrompt,
            contextRequirements: [...contextRequirements],
            outputSchema: {},
            constraints: [],
            examples: [],
            retryPolicy: { limit: 4, backoff: true },
            tokenCeiling,
          },
        },
      },
      update: { name, description },
    });
  }



  for (const [id, name, description] of reportDefinitions) {
    await prisma.reportDefinition.upsert({
      where: { id },
      create: {
        id,
        name,
        description,
        versions: {
          create: {
            version: 1,
            active: true,
            contextRequirements: ["project", "strategy", "delivery", "viability"],
            permittedRoles: ["founder", "team"],
            outputSchema: {
              type: "object",
              required: ["summary", "sections", "actions"],
              properties: {
                summary: { type: "string" },
                sections: { type: "array" },
                actions: { type: "array" },
              },
            },
            templateKey: "report-default",
            requiresLlm: id !== "investor-readiness",
          },
        },
      },
      update: {},
    });
    if (id === "investor-readiness") {
      await prisma.reportDefinitionVersion.updateMany({
        where: { reportDefinitionId: id, active: true },
        data: { requiresLlm: false },
      });
    }
  }

  await prisma.documentTemplate.upsert({
    where: { id: "report-default" },
    create: {
      id: "report-default",
      name: "Default Product Report",
      description: "Calm intelligence workspace report template.",
      type: "report",
      versions: {
        create: {
          version: 1,
          active: true,
          html: templateHtml,
          css: templateCss,
          schema: {
            type: "object",
            required: ["summary", "sections", "actions"],
            properties: {
              summary: { type: "string" },
              sections: { type: "array" },
              actions: { type: "array" }
            }
          }
        },
      },
    },
    update: {},
  });

  const defaultTemplates = [
    {
      id: "founder-pack",
      name: "Narrative Founder Pack",
      description: "Founder summary layout with product concept, audience, vision, and key features.",
      type: "founder-pack",
      schema: {
        type: "object",
        required: ["projectName", "summary", "vision", "targetAudience", "keyFeatures", "revenueModel"],
        properties: {
          projectName: { type: "string" },
          summary: { type: "string" },
          vision: { type: "string" },
          targetAudience: { type: "string" },
          keyFeatures: { type: "array", items: { type: "string" } },
          revenueModel: { type: "string" }
        }
      },
      html: `<main>
  <header>
    <div class="brand">REMORRA</div>
    <h1>Founder Pack: {{projectName}}</h1>
    <p>Narrative summary of the product concept, audience, vision, and commercial context.</p>
  </header>
  <section>
    <h2>Product Vision</h2>
    <p>{{vision}}</p>
    <h2>Executive Summary</h2>
    <p>{{summary}}</p>
    <h2>Target Audience</h2>
    <p>{{targetAudience}}</p>
    <h2>Key Features</h2>
    <ul>
      {{#each keyFeatures}}
      <li>{{this}}</li>
      {{/each}}
    </ul>
    <h2>Revenue Model</h2>
    <p>{{revenueModel}}</p>
  </section>
  <footer>Generated by Remorra Product Intelligence</footer>
</main>`,
      css: templateCss
    },
    {
      id: "product-pack",
      name: "Entity Linkage Product Pack",
      description: "Product Pack layout showcasing ambitions, OKRs, personas, painpoints, user needs, and link coverage.",
      type: "product-pack",
      schema: {
        type: "object",
        required: ["projectName", "coveragePercent", "linkageValid", "ambitions", "personas"],
        properties: {
          projectName: { type: "string" },
          coveragePercent: { type: "number" },
          linkageValid: { type: "boolean" },
          ambitions: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "title", "detail"],
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                detail: { type: "string" }
              }
            }
          },
          personas: {
            type: "array",
            items: {
              type: "object",
              required: ["id", "name", "description", "userNeeds", "painPoints"],
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                description: { type: "string" },
                userNeeds: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["id", "statement"],
                    properties: {
                      id: { type: "string" },
                      statement: { type: "string" }
                    }
                  }
                },
                painPoints: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["id", "statement"],
                    properties: {
                      id: { type: "string" },
                      statement: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      },
      html: `<main>
  <header>
    <div class="brand">REMORRA</div>
    <h1>Product Pack: {{projectName}}</h1>
    <p>Ambitions, user needs, personas, and strategic alignment mapping. Coverage: {{coveragePercent}}% (Linkage: {{linkageValid}})</p>
  </header>
  <section>
    <h2>Ambitions</h2>
    {{#each ambitions}}
    <div style="margin-bottom: 14px;">
      <h3>{{title}}</h3>
      <p>{{detail}}</p>
    </div>
    {{/each}}
    <h2>Personas</h2>
    {{#each personas}}
    <div style="margin-bottom: 14px;">
      <h3>{{name}}</h3>
      <p>{{description}}</p>
    </div>
    {{/each}}
  </section>
  <footer>Generated by Remorra Product Intelligence</footer>
</main>`,
      css: templateCss
    },
    {
      id: "investor-pack",
      name: "Investor Readiness Pack",
      description: "Readiness score, viability analysis, budget indicators, and RAID item lists.",
      type: "investor-pack",
      schema: {
        type: "object",
        required: [
          "projectName", "viabilityScore", "viabilityRationale", "productCoveragePercent", 
          "deliveryLinkageValid", "activeSprintCompletedTasks", "activeSprintTotalTasks", 
          "totalBudgetSpentMinor", "totalBudgetAllocatedMinor", "risksCount", "criticalRisksCount"
        ],
        properties: {
          projectName: { type: "string" },
          viabilityScore: { type: "number" },
          viabilityRationale: { type: "string" },
          productCoveragePercent: { type: "number" },
          deliveryLinkageValid: { type: "boolean" },
          activeSprintCompletedTasks: { type: "number" },
          activeSprintTotalTasks: { type: "number" },
          totalBudgetSpentMinor: { type: "number" },
          totalBudgetAllocatedMinor: { type: "number" },
          risksCount: { type: "number" },
          criticalRisksCount: { type: "number" }
        }
      },
      html: `<main>
  <header>
    <div class="brand">REMORRA</div>
    <h1>Investor Pack: {{projectName}}</h1>
    <p>Deterministic readiness metrics, viability evidence, and commercial risk analysis.</p>
  </header>
  <section>
    <div class="score" style="display: grid; grid-template-columns: 110px 1fr; gap: 18px; padding: 18px; background: #eef5ef; border-radius: 10px;">
      <div class="number" style="color: #23694a; font-size: 42px; font-weight: 700;">{{viabilityScore}}</div>
      <div>
        <h2>Viability Assessment</h2>
        <p>{{viabilityRationale}}</p>
      </div>
    </div>
    <h2>Strategic Alignment</h2>
    <p>Product Coverage: <strong>{{productCoveragePercent}}%</strong></p>
    <p>Delivery Linkage Valid: <strong>{{deliveryLinkageValid}}</strong></p>
    <h2>Delivery and Execution</h2>
    <p>Active sprint completed tasks: <strong>{{activeSprintCompletedTasks}} / {{activeSprintTotalTasks}}</strong></p>
    <h2>Financial Summary</h2>
    <p>Budget Spent Minor (cents): <strong>{{totalBudgetSpentMinor}}</strong></p>
    <p>Budget Allocated Minor (cents): <strong>{{totalBudgetAllocatedMinor}}</strong></p>
    <h2>Risks and Dependencies</h2>
    <p>Total RAID Items: <strong>{{risksCount}}</strong> (Critical: <strong>{{criticalRisksCount}}</strong>)</p>
  </section>
  <footer>Generated by Remorra Product Intelligence</footer>
</main>`,
      css: templateCss
    },
    {
      id: "build-pack",
      name: "Build Setup Pack",
      description: "Sprint checklists, functional user stories, tasks, RAID items, and specifications.",
      type: "build-pack",
      schema: {
        type: "object",
        required: ["projectName", "cycleName", "cycleStatus", "stories", "tasks", "risks"],
        properties: {
          projectName: { type: "string" },
          cycleName: { type: "string" },
          cycleStatus: { type: "string" },
          stories: {
            type: "array",
            items: {
              type: "object",
              required: ["title", "status"],
              properties: {
                title: { type: "string" },
                status: { type: "string" },
                description: { type: "string" },
                acceptance: { type: "array", items: { type: "string" } }
              }
            }
          },
          tasks: {
            type: "array",
            items: {
              type: "object",
              required: ["title", "status"],
              properties: {
                title: { type: "string" },
                status: { type: "string" },
                assigneeName: { type: "string" }
              }
            }
          },
          risks: {
            type: "array",
            items: {
              type: "object",
              required: ["title", "severity", "status"],
              properties: {
                title: { type: "string" },
                severity: { type: "string" },
                status: { type: "string" }
              }
            }
          }
        }
      },
      html: `<main>
  <header>
    <div class="brand">REMORRA</div>
    <h1>Build Pack: {{projectName}}</h1>
    <p>Active sprint delivery stories, tasks, acceptance criteria, and RAID dependencies.</p>
  </header>
  <section>
    <h2>Active Cycle: {{cycleName}} ({{cycleStatus}})</h2>
    <h2>User Stories & Functional Specs</h2>
    {{#each stories}}
    <div style="margin-bottom: 14px;">
      <h3>{{title}} ({{status}})</h3>
      <p>{{description}}</p>
    </div>
    {{/each}}
    <h2>Tasks</h2>
    <ul>
      {{#each tasks}}
      <li>{{title}} - Assignee: {{assigneeName}} ({{status}})</li>
      {{/each}}
    </ul>
    <h2>RAID Item Risks</h2>
    <ul>
      {{#each risks}}
      <li>{{title}} - Severity: {{severity}} ({{status}})</li>
      {{/each}}
    </ul>
  </section>
  <footer>Generated by Remorra Product Intelligence</footer>
</main>`,
      css: templateCss
    }
  ];

  for (const template of defaultTemplates) {
    await prisma.documentTemplate.upsert({
      where: { id: template.id },
      create: {
        id: template.id,
        name: template.name,
        description: template.description,
        type: template.type,
        versions: {
          create: {
            version: 1,
            active: true,
            html: template.html,
            css: template.css,
            schema: template.schema as any,
          }
        }
      },
      update: {
        name: template.name,
        description: template.description,
        type: template.type,
      },
    });
  }

  const costs = [
    { key: "model:claude-sonnet-4-6", name: "Claude 3.5 Sonnet", unit: "per_1m_tokens", currency: "USD", active: true, inputCostMinor: 300, outputCostMinor: 1500, flatCostMinor: 0 },
    { key: "model:claude-opus-4-8", name: "Claude 3 Opus", unit: "per_1m_tokens", currency: "USD", active: true, inputCostMinor: 1500, outputCostMinor: 7500, flatCostMinor: 0 },
    { key: "pdf-render", name: "PDF Rendering Flat Cost", unit: "flat", currency: "USD", active: true, inputCostMinor: 0, outputCostMinor: 0, flatCostMinor: 5 },
    { key: "storage-per-mb", name: "Storage Cost per MB-Month", unit: "per_mb", currency: "USD", active: true, inputCostMinor: 0, outputCostMinor: 0, flatCostMinor: 2 }
  ];
  for (const cost of costs) {
    await prisma.costConfig.upsert({
      where: { key: cost.key },
      create: cost,
      update: {
        name: cost.name,
        unit: cost.unit,
        active: cost.active,
        inputCostMinor: cost.inputCostMinor,
        outputCostMinor: cost.outputCostMinor,
        flatCostMinor: cost.flatCostMinor,
      },
    });
  }

  const retention = [
    ["active-conversations", "Active conversation messages", 90],
    ["drafts", "Saved drafts", 180],
    ["generated-files", "Generated PDFs and export archives", 30],
    ["audit-records", "Audit records", 2555],
    ["deletion-grace", "Account deletion grace period", 30],
  ] as const;
  for (const [id, description, retentionDays] of retention) {
    await prisma.retentionPolicy.upsert({
      where: { id },
      create: { id, description, retentionDays },
      update: { description, retentionDays },
    });
  }
}

main()
  .finally(() => prisma.$disconnect());

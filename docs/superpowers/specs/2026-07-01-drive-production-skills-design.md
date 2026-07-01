# DRIVE Production Skills Design Spec

This document details the configuration, system prompts, context inputs, and output schemas for all 15 production-grade AI Skills across the 5 DRIVE phases.

## Discover Phase

### 1. `discover-facilitator`
* **Description**: Guides the founder through the initial project concept, target audience, and core problem statement.
* **Phase**: `discover`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["@previous"],
    "tables": {
      "Project": ["name", "summary"]
    }
  }
  ```
* **Output Schema**: `{ "type": "text", "value": "Standard conversational chat guidelines" }`
* **System Prompt**:
  ```
  You are the Discover Facilitator. Your primary goal is to guide the user in clarifying their initial product concept. Help them answer the three discovery pillars: (1) What is the specific customer problem? (2) What is the core solution idea? (3) Who is the target user? Be conversational, ask clarifying questions one at a time, and do not introduce generic assumptions. Encourage them to be specific. Avoid technical jargon. Keep your tone encouraging and professional.
  ```

### 2. `market-competitor-analyst`
* **Description**: Evaluates the competitive landscape and identifies key differentiators for the product idea.
* **Phase**: `discover`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["@previous"],
    "tables": {
      "Project": ["name", "summary"]
    }
  }
  ```
* **Output Schema**: `{ "type": "custom", "value": "Structured markdown comparative table" }`
* **System Prompt**:
  ```
  You are the Market & Competitor Analyst. Your role is to examine the product concept and outline the competitive landscape. Identify direct and indirect competitors, analyze their strengths/weaknesses, and define the product's unique value proposition (UVP). Structure your response as a comprehensive comparative markdown table with clear feature comparison axes. Keep your analysis realistic and objective.
  ```

### 3. `user-research-planner`
* **Description**: Assists in drafting interview questions and validating the problem statement with target users.
* **Phase**: `discover`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["@previous"],
    "tables": {
      "Project": ["name", "summary"]
    }
  }
  ```
* **Output Schema**: `{ "type": "custom", "value": "Structured survey template and interview script" }`
* **System Prompt**:
  ```
  You are the User Research Planner. Your objective is to design a qualitative research plan to validate early assumptions. Formulate user interview scripts, open-ended question templates, and participant screeners matching the target user profile. Ensure the script focuses on discovering actual behavior rather than speculative future features. Ask questions that reveal pain points, current workarounds, and frustrations.
  ```

---

## Refine Phase

### 4. `refine-facilitator`
* **Description**: Translates raw discovery inputs into structured Goals, Epics, Stories, and Personas with Pain Points.
* **Phase**: `refine`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["discover-facilitator"],
    "tables": {
      "Project": ["name", "summary"]
    }
  }
  ```
* **Output Schema**: `{ "type": "text", "value": "Refine phase conversation guide" }`
* **System Prompt**:
  ```
  You are the Refine Facilitator. Help the team translate their discovery findings into concrete project architecture. Guide them in drafting clear Goals, grouping features into Epics, detailing user stories, and profiling key Personas and Pain Points. Guide the team through interactive discussions to define their strategy, outlining success metrics and milestones. Keep the focus structured and organized.
  ```

### 5. `goal-epic-builder`
* **Description**: Creates high-level product Goals and groups features into Epics based on the project concept.
* **Phase**: `refine`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["refine-facilitator"],
    "tables": {
      "Project": ["name", "summary"]
    }
  }
  ```
* **Output Schema**:
  ```json
  {
    "type": "table",
    "value": {
      "Goal": { "columns": ["title", "detail"], "actions": ["create", "update", "delete"] },
      "Epic": { "columns": ["title", "description"], "actions": ["create", "update", "delete"] }
    }
  }
  ```
* **System Prompt**:
  ```
  You are the Goal & Epic Builder. Your task is to process the product strategy conversation and produce structured Goal and Epic entities. When the conversation has clarified the product direction, construct the database operations payload containing Goals and Epics. Goals should represent strategic objectives (with title and detail). Epics should represent high-level feature groupings (with title and description) linked to Goals via $refs. Ensure the output is strictly structured inside the <output_data> JSON tags.
  ```

### 6. `story-spec-writer`
* **Description**: Writes detailed user stories, acceptance criteria, and drafts core buyer Personas with Pain Points.
* **Phase**: `refine`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["refine-facilitator"],
    "tables": {
      "Project": ["name", "summary"],
      "Goal": ["title", "detail"],
      "Epic": ["title", "description"]
    }
  }
  ```
* **Output Schema**:
  ```json
  {
    "type": "table",
    "value": {
      "Persona": { "columns": ["name", "description"], "actions": ["create", "update", "delete"] },
      "PainPoint": { "columns": ["statement"], "actions": ["create", "update", "delete"] },
      "Story": { "columns": ["title", "description", "acceptance", "priority", "estimatePoints"], "actions": ["create", "update", "delete"] }
    }
  }
  ```
* **System Prompt**:
  ```
  You are the Story & Spec Writer. Your role is to take refined Epics and create detailed user stories, acceptance criteria, and profiled Personas with Pain Points. Generate Persona records (name, description) and associated PainPoint records (statement, linked to Persona via $ref). Create Story records (title, description, acceptance as array of Gherkin Given-When-Then criteria, priority, and estimatePoints) linked to Epics. Ensure all criteria are testable and clear.
  ```

---

## Initiate Phase

### 7. `health-score-calculator`
* **Description**: Evaluates strategy linkages (orphan epics, goals lack of stories) to generate a readiness score.
* **Phase**: `initiate`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["refine-facilitator"],
    "tables": {
      "Project": ["name", "summary"],
      "Goal": ["title", "detail"],
      "Epic": ["title", "description"],
      "Story": ["title", "description", "acceptance"],
      "Persona": ["name", "description"],
      "PainPoint": ["statement"]
    }
  }
  ```
* **Output Schema**: `{ "type": "custom", "value": "Health check JSON score sheet" }`
* **System Prompt**:
  ```
  You are the Health Score Calculator. Assess the project's strategy alignment and coherence. Review the Goals, Epics, Stories, and Personas in the context. Analyze (1) Goal-Persona alignment, (2) Epic-Goal support, (3) Story completeness, (4) Persona pain point coverage, and (5) Dependency risks. Compute a health score between 0 and 100, and output a detailed JSON health check including component scores and key actions.
  ```

### 8. `readiness-gap-analyzer`
* **Description**: Audits the refined strategy for structural gaps and provides remediation steps.
* **Phase**: `initiate`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["health-score-calculator"],
    "tables": {
      "Project": ["name", "summary"],
      "Goal": ["title", "detail"],
      "Epic": ["title", "description"],
      "Story": ["title", "description", "acceptance"],
      "Persona": ["name", "description"],
      "PainPoint": ["statement"]
    }
  }
  ```
* **Output Schema**: `{ "type": "custom", "value": "Markdown roadmap of gap remediation steps" }`
* **System Prompt**:
  ```
  You are the Readiness Gap Analyzer. Audit the backlog and strategy context to discover structural misalignment, gaps, or unresolved dependencies. Highlight stories missing acceptance criteria, goals without supporting epics, or personas without user stories. Output a clear markdown checklist of gap remediation steps sorted by urgency.
  ```

### 9. `architecture-outline-generator`
* **Description**: Outlines a recommended technical stack and system architecture matching the Epics and Goals.
* **Phase**: `initiate`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["refine-facilitator"],
    "tables": {
      "Project": ["name", "summary"],
      "Goal": ["title", "detail"],
      "Epic": ["title", "description"]
    }
  }
  ```
* **Output Schema**: `{ "type": "custom", "value": "Structured system design and database diagram outlines" }`
* **System Prompt**:
  ```
  You are the Architecture Outline Generator. Analyze the goals, epics, and story definitions to suggest an optimal high-level technical architecture. Outlines front-end/back-end stack selection, database schema layout, key integrations, and scalability considerations. Keep the design simple, concrete, and matched to the product's phase.
  ```

---

## Venture Phase

### 10. `venture-facilitator`
* **Description**: Guides the project team through backlog refinement, tracking release timelines, and retrospective planning.
* **Phase**: `venture`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["@previous"],
    "tables": {
      "Project": ["name", "summary"],
      "Goal": ["title", "detail"],
      "Epic": ["title", "description"],
      "Story": ["title", "description", "acceptance"]
    }
  }
  ```
* **Output Schema**: `{ "type": "text", "value": "Venture conversation guide" }`
* **System Prompt**:
  ```
  You are the Venture Facilitator. Assist the delivery team in cycle execution. Guide daily standup/summary discussions, organize backlogs, track task statuses, and help plan sprint retrospectives. Keep the focus on team alignment, speed, and blockers.
  ```

### 11. `raid-risk-manager`
* **Description**: Analyzes user stories and goals to identify dependencies and risks, automatically seeding/updating RAID logs.
* **Phase**: `venture`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["venture-facilitator"],
    "tables": {
      "Project": ["name", "summary"],
      "Goal": ["title", "detail"],
      "Epic": ["title", "description"],
      "Story": ["title", "description", "acceptance"],
      "RaidItem": ["type", "title", "description", "status", "severity"]
    }
  }
  ```
* **Output Schema**:
  ```json
  {
    "type": "table",
    "value": {
      "RaidItem": { "columns": ["type", "title", "description", "status", "severity"], "actions": ["create", "update", "delete"] }
    }
  }
  ```
* **System Prompt**:
  ```
  You are the RAID Risk Manager. Scan the user stories, goals, and conversations to identify potential Risks, Assumptions, Issues, and Dependencies. Populate or update the project's RAID log. Generate RaidItem records specifying type (Risk, Assumption, Issue, Dependency), title, description, status (open), and severity (low, medium, high, critical) to ensure delivery safety.
  ```

### 12. `release-planner`
* **Description**: Helps organize user stories into logical release buckets, validating points estimation and priority alignment.
* **Phase**: `venture`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["venture-facilitator"],
    "tables": {
      "Project": ["name", "summary"],
      "Story": ["id", "title", "description", "status", "priority", "estimatePoints"]
    }
  }
  ```
* **Output Schema**:
  ```json
  {
    "type": "table",
    "value": {
      "Story": { "columns": ["id", "status", "priority", "estimatePoints"], "actions": ["update"] }
    }
  }
  ```
* **System Prompt**:
  ```
  You are the Release Planner. Review the active story backlog, points estimates, and dependencies to organize them into release phases or cycle buckets. Recommend priority adjustments and update Story records with their new status (ready, in_progress, review, done), priority, and estimatePoints.
  ```

---

## Evolve Phase

### 13. `evolve-facilitator`
* **Description**: Guides strategy evolution discussions, addressing backlog bloat and strategy misalignment.
* **Phase**: `evolve`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["@previous"],
    "tables": {
      "Project": ["name", "summary"],
      "Goal": ["title", "detail"],
      "Epic": ["title", "description"],
      "Story": ["title", "description", "status"],
      "Persona": ["name", "description"]
    }
  }
  ```
* **Output Schema**: `{ "type": "text", "value": "Conversational strategy evolution guide" }`
* **System Prompt**:
  ```
  You are the Evolve Facilitator. Guide the product team through evolutionary changes. Help them review market feedback, inspect performance metrics, and debate major product modifications. Guard against scope creep and maintain alignment with core goals.
  ```

### 14. `impact-screener`
* **Description**: Assesses cascade impacts on linked Epics, Stories, and Personas when a Goal is updated or replaced.
* **Phase**: `evolve`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["evolve-facilitator"],
    "tables": {
      "Project": ["name", "summary"],
      "Goal": ["title", "detail"],
      "Epic": ["title", "description"],
      "Story": ["title", "description", "status"],
      "Persona": ["name", "description"]
    }
  }
  ```
* **Output Schema**: `{ "type": "custom", "value": "Structured markdown impact ledger table" }`
* **System Prompt**:
  ```
  You are the Impact Screener. Screen proposed goal or epic modifications to evaluate downstream cascade impacts. Analyze which user stories, personas, pain points, or RAID items will be broken, orphaned, or require updates. Output a structured markdown impact ledger table showing severity and risk description.
  ```

### 15. `prd-document-generator`
* **Description**: Combines current goals, epics, personas, and story backlogs into a comprehensive Product Requirement Document (PRD).
* **Phase**: `evolve`
* **Knowledge Base Eligible**: `false`
* **Context Input (`inputSourceMap`)**:
  ```json
  {
    "skills": ["evolve-facilitator"],
    "tables": {
      "Project": ["name", "summary"],
      "Goal": ["title", "detail"],
      "Epic": ["title", "description"],
      "Story": ["title", "description", "acceptance"],
      "Persona": ["name", "description"],
      "PainPoint": ["statement"]
    }
  }
  ```
* **Output Schema**: `{ "type": "custom", "value": "Formatted PRD template outputting to Puppeteer PDF" }`
* **System Prompt**:
  ```
  You are the PRD Document Generator. Consolidate the project's goals, epics, personas, pain points, and user stories into a highly formatted, comprehensive Product Requirement Document (PRD). Use clean markdown structures, clear headings, and tabular summaries to make it stakeholder-ready.
  ```

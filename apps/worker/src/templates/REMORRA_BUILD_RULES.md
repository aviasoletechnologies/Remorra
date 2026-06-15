# REMORRA BUILD RULES

> **This file is mandatory.** It must be ingested and followed by every developer receiving a Build Pack from Remorra.

## 1. Build Pack Structure

The Build Pack contains:
- **User Stories** — Functional specifications with acceptance criteria. Each story links to a parent User Need.
- **Tasks** — Atomic work items assigned to specific team members. Each task links to a parent User Story.
- **RAID Items** — Risks, Assumptions, Issues, and Dependencies. Severity levels: `critical`, `high`, `medium`, `low`.
- **Cycle Context** — The active sprint/cycle metadata including name, status, and dates.

## 2. Entity Integrity Rules

- **Never break linkage.** Every Task must remain linked to its parent User Story. Every User Story must remain linked to its parent User Need.
- **Do not create, modify, or delete strategic entities.** Ambitions, OKRs, Personas, Pain Points, and User Needs are managed exclusively through Remorra's Evolve workflow.
- **Task status transitions** follow the Kanban flow: `backlog` → `todo` → `in_progress` → `done`. Do not skip statuses.
- **Version fields** must be preserved. Every mutable entity carries a `version` field used for optimistic concurrency control. Do not modify version fields directly.

## 3. Import Format for Returning Changes

When build work is complete, prepare a JSON import file with the following structure:

```json
{
  "buildCycleId": "<cycle-id>",
  "completedAt": "<ISO-8601 timestamp>",
  "changes": [
    {
      "entityType": "task",
      "entityId": "<task-id>",
      "action": "update",
      "fields": {
        "status": "done",
        "notes": "Implementation complete, tested locally."
      }
    },
    {
      "entityType": "user_story",
      "entityId": "<story-id>",
      "action": "update",
      "fields": {
        "status": "done",
        "acceptanceMet": true
      }
    }
  ],
  "newIssues": [
    {
      "title": "API rate limit too low for production load",
      "severity": "high",
      "description": "During load testing, the API returned 429 errors under 50 concurrent users."
    }
  ],
  "notes": "Summary of build outcomes, blockers encountered, and decisions made."
}
```

## 4. Import Processing

When you upload the import file to Remorra:
1. An **Evolve session** is automatically created from the import.
2. The **Impact Screener** assesses each change against linked entities.
3. The **Founder reviews** each item and approves or rejects individually.
4. Approved changes are applied **atomically** — all together or none.
5. All changes are logged to the **Audit Trail**.

## 5. Communication Protocol

- **Suppliers** direct all questions to the Founder. There is no direct support channel.
- **Team Members** can view the full product context but cannot modify strategic entities.
- **Build issues** should be documented as new RAID items in the import file, not communicated informally.

## 6. Quality Standards

- All acceptance criteria on User Stories must be verified before marking a story as `done`.
- New issues discovered during build must be reported in the `newIssues` array of the import file.
- Code changes should reference the Task ID and User Story ID in commit messages.

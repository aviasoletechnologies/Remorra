# Update Context Configuration UI Label Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change the UI summary label under "Context Assembly Configuration" so it does not say the legacy "Configured: 1 skill" when the Previous Skill checkbox is selected. It should read "Configured: Previous skill conversations".

**Architecture:** We will update `describeInputSourceMap` in `apps/web/src/pages/admin.tsx` to detect if the configured skills list contains `"@previous"`. If it does, we format the text as `"Previous skill conversations"` instead of the dynamic `"${skillsCount} skill"` counter.

**Tech Stack:** React, TypeScript

## Global Constraints
- Maintain strict type safety.
- Verify changes compile using `pnpm typecheck`.

---

### Task 1: Update summary label formatting

**Files:**
- Modify: `apps/web/src/pages/admin.tsx`

**Interfaces:**
- Consumes: `inputSourceMap`
- Produces: Formatted summary string `Configured: Previous skill conversations` (and/or tables)

- [ ] **Step 1: Update `describeInputSourceMap` helper**
  Modify [admin.tsx:L71-88](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/pages/admin.tsx#L71-L88) to translate `"@previous"` to `"Previous skill conversations"`.
  Code to implement:
  ```typescript
  function describeInputSourceMap(sourceMap: any): string {
    if (!sourceMap) return "No dynamic context configured";
    const skillsCount = sourceMap.skills?.length || 0;
    const tablesCount = Object.keys(sourceMap.tables || {}).length;
    
    if (skillsCount === 0 && tablesCount === 0) {
      return "No dynamic context configured";
    }
    
    const parts: string[] = [];
    if (skillsCount > 0) {
      if (sourceMap.skills.includes("@previous")) {
        parts.push("Previous skill conversations");
      } else {
        parts.push(`${skillsCount} skill${skillsCount > 1 ? "s" : ""}`);
      }
    }
    if (tablesCount > 0) {
      parts.push(`${tablesCount} table${tablesCount > 1 ? "s" : ""}`);
    }
    return `Configured: ${parts.join(" and ")}`;
  }
  ```

---

### Task 2: Verification

- [ ] **Step 1: Run typecheck**
  Run: `pnpm --filter @remorra/web typecheck`
  Expected: Clean build.

- [ ] **Step 2: Run all tests**
  Run: `pnpm test`
  Expected: All tests pass.

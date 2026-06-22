# Dynamic Previous Skill Conversation Context Assembly

This design document outlines the changes required to replace the hardcoded skill list in the "Configure Context Assembly" UI with a single "Previous skill Conversations" checkbox, and resolve the previous skill dynamically in the worker at runtime.

## Requirements

1. **UI Cleanliness**: In the admin section, instead of listing specific skills (like `founder-pack`), show only a single checkbox labeled "Previous skill Conversations".
2. **Meta-Identifier representation**: Use a meta-identifier string `"@previous"` in the `inputSourceMap.skills` array to indicate that the previous skill's conversation context should be fetched.
3. **Dynamic Backend Lookup**: During context assembly at runtime, if `"@previous"` is present, dynamically find the previous step in the active workflow run and fetch its conversation history.

## Design

### 1. UI Updates (Web App)

Files affected: [admin.tsx](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/pages/admin.tsx)

- Update the context configuration sections in both the "Create Skill" and "Edit Skill Version" modals.
- Render a single checkbox checking if `"@previous"` is included in `inputSourceMap.skills`.
- Simplify display descriptions in `describeSkillInputRequirement` to map `"@previous"` to `"Previous Skill"`.

### 2. Backend Context Assembly (Worker)

Files affected: [context.ts](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/worker/src/assemblers/context.ts), [skills.ts](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/worker/src/assemblers/skills.ts)

- Update `assembleContext` to accept `currentSkillId` and `conversationId`.
- In `assembleContext`, check if `inputSourceMap.skills` includes `"@previous"`.
- If it does, find the `FlowRun` matching `conversationId` and `projectId`.
- Traverse the flow version steps to identify the step immediately preceding the currently executing step (either via `parentStepKey`, `transitionRules`, or position fallback).
- Retrieve the previous step's `skillId` and fetch its conversation messages for the current project.
- Append these messages to the context sections in the same format as regular skills.

## Verification Plan

### Automated Verification
- Run `pnpm typecheck` to verify TypeScript compilation.
- Run `pnpm test` to verify unit tests pass.

### Manual Verification
- Verify the Admin page context config modal shows only the single "Previous skill Conversations" checkbox.
- Check / uncheck the checkbox, save the skill version, and verify that `@previous` is stored in the database version.

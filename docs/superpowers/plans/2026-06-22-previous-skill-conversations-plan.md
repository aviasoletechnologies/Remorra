# Dynamic Previous Skill Conversation Context Assembly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the context configuration UI by showing only a single "Previous skill Conversations" checkbox, and resolve the previous skill dynamically in the backend using the flow's execution sequence.

**Architecture:** We use a special meta-identifier `"@previous"` inside the `inputSourceMap.skills` array to request the previous skill's conversation history. The Web UI manages this checkbox directly without needing to list/hardcode specific skills. The Worker context assembler resolves `"@previous"` dynamically by looking up the `FlowRun` steps matching the active conversation, identifying the preceding step, and replacing the placeholder with the resolved skill's conversation history.

**Tech Stack:** React, Tailwind CSS/Vanilla CSS, TypeScript, Prisma, Vitest

## Global Constraints
- Strictly maintain TypeScript strict mode.
- Avoid introducing database migrations; use the existing JSON fields (`inputSourceMap`) and dynamic runtime resolution.
- Verify all changes compile using `pnpm typecheck` and tests pass using `pnpm test`.

---

### Task 1: Update Frontend Admin UI to Use Dynamic Checkbox

**Files:**
- Modify: `apps/web/src/pages/admin.tsx`

**Interfaces:**
- Consumes: None
- Produces: Updates `editInputSourceMap.skills` and `newSkillInputSourceMap.skills` with the `"@previous"` placeholder.

- [ ] **Step 1: Update `describeSkillInputRequirement` to render a human-readable label**
  Modify [admin.tsx:L53-68](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/pages/admin.tsx#L53-L68) to translate `"@previous"` to `"Previous Skill"`.
  Code to implement:
  ```typescript
  function describeSkillInputRequirement(version: any): string {
    const sourceMap = parseInputSourceMap(version?.inputSourceMap);
    const parts: string[] = [];
    const skills = sourceMap.skills;
    const tables = Object.keys(sourceMap.tables);
    if (skills.length > 0) {
      const skillLabels = skills.map((s: string) => s === "@previous" ? "Previous Skill" : s);
      parts.push(`Skills: ${skillLabels.join(", ")}`);
    }
    if (tables.length > 0) {
      parts.push(`Tables: ${tables.join(", ")}`);
    }
    if (parts.length > 0) {
      return `Dynamic context: ${parts.join(" | ")}`;
    }
    return "";
  }
  ```

- [ ] **Step 2: Update the Edit Skill Version context modal skills list**
  Modify [admin.tsx:L1097-1130](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/pages/admin.tsx#L1097-L1130) to show only a single checkbox mapping to `"@previous"`.
  Code to implement:
  ```typescript
                  <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-secondary/10 p-1.5 rounded">
                      <input
                        type="checkbox"
                        checked={editInputSourceMap?.skills?.includes("@previous") || false}
                        onChange={(e) => {
                          const skills = [...(editInputSourceMap?.skills || [])].filter(s => s !== "@previous");
                          if (e.target.checked) {
                            skills.push("@previous");
                          }
                          setEditInputSourceMap({ ...editInputSourceMap, skills });
                        }}
                        className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="font-medium text-foreground">Previous skill Conversations</span>
                        <span className="text-xs text-muted-foreground block font-mono">Include conversation history of the previous skill in the flow</span>
                      </div>
                    </label>
                  </div>
  ```

- [ ] **Step 3: Update the Create Skill context modal skills list**
  Modify [admin.tsx:L1237-1270](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/web/src/pages/admin.tsx#L1237-L1270) to use the same single checkbox mapping to `"@previous"`.
  Code to implement:
  ```typescript
                  <div className="flex flex-col gap-2 max-h-96 overflow-y-auto pr-1">
                    <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-secondary/10 p-1.5 rounded">
                      <input
                        type="checkbox"
                        checked={newSkillInputSourceMap?.skills?.includes("@previous") || false}
                        onChange={(e) => {
                          const skills = [...(newSkillInputSourceMap?.skills || [])].filter(s => s !== "@previous");
                          if (e.target.checked) {
                            skills.push("@previous");
                          }
                          setNewSkillInputSourceMap({ ...newSkillInputSourceMap, skills });
                        }}
                        className="rounded border-input text-emerald-500 focus:ring-emerald-500"
                      />
                      <div>
                        <span className="font-medium text-foreground">Previous skill Conversations</span>
                        <span className="text-xs text-muted-foreground block font-mono">Include conversation history of the previous skill in the flow</span>
                      </div>
                    </label>
                  </div>
  ```

- [ ] **Step 4: Verify UI files typecheck**
  Run: `pnpm --filter @remorra/web typecheck`
  Expected: Clean build with no errors.

---

### Task 2: Implement Dynamic Previous Skill Backend Context Resolution

**Files:**
- Modify: `apps/worker/src/assemblers/skills.ts`
- Modify: `apps/worker/src/assemblers/context.ts`
- Modify: `apps/worker/src/assemblers/context.test.ts`

**Interfaces:**
- Consumes: `"@previous"` inside `inputSourceMap.skills` list.
- Produces: Appends `skill_conversation_history_<resolved_skill_id>` to context sections dynamically.

- [ ] **Step 1: Update `invokeSkill` to forward runtime variables to `assembleContext`**
  Modify [skills.ts:L113](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/worker/src/assemblers/skills.ts#L113) to pass `skillId` and `input.conversationId`:
  ```typescript
      customSections = await assembleContext(
        input.projectId,
        sourceMap,
        skillId,
        input.conversationId
      );
  ```

- [ ] **Step 2: Update `assembleContext` signature and add previous skill lookup**
  Modify [context.ts:L43-80](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/worker/src/assemblers/context.ts#L43-L80) to add the `currentSkillId` and `conversationId` parameters, detect `"@previous"`, traverse `FlowStep` database hierarchy, and query messages.
  Code to implement:
  ```typescript
  export async function assembleContext(
    projectId: string,
    inputSourceMap: {
      skills?: string[];
      tables?: Record<string, string[]>;
    },
    currentSkillId?: string,
    conversationId?: string
  ) {
    const sections: { tag: string; trust: "trusted" | "application" | "user"; content: string }[] = [];

    // 1. Fetch other skills' conversations if configured
    if (inputSourceMap.skills && inputSourceMap.skills.length > 0) {
      const resolvedSkills = [...inputSourceMap.skills];
      const prevIndex = resolvedSkills.indexOf("@previous");
      if (prevIndex > -1) {
        resolvedSkills.splice(prevIndex, 1);
        
        let previousSkillId: string | null = null;
        if (conversationId && currentSkillId) {
          const flowRun = await prisma.flowRun.findFirst({
            where: { conversationId, projectId },
            include: {
              flowVersion: {
                include: {
                  steps: {
                    orderBy: { position: "asc" },
                  },
                },
              },
            },
          });

          if (flowRun) {
            const steps = flowRun.flowVersion.steps;
            const activeStep = steps.find(
              (s: any) => s.skillId === currentSkillId || s.key === flowRun.currentStepKey
            );
            if (activeStep) {
              if (activeStep.parentStepKey) {
                const parentStep = steps.find((s: any) => s.key === activeStep.parentStepKey);
                if (parentStep?.skillId) {
                  previousSkillId = parentStep.skillId;
                }
              }
              if (!previousSkillId) {
                const transitionStep = steps.find((s: any) => {
                  const rules = s.transitionRules as any;
                  return rules?.nextStepKey === activeStep.key;
                });
                if (transitionStep?.skillId) {
                  previousSkillId = transitionStep.skillId;
                }
              }
              if (!previousSkillId) {
                const precedingStep = [...steps]
                  .reverse()
                  .find((s: any) => s.position < activeStep.position && s.skillId);
                if (precedingStep?.skillId) {
                  previousSkillId = precedingStep.skillId;
                }
              }
            }
          }
        }

        if (previousSkillId) {
          resolvedSkills.push(previousSkillId);
        }
      }

      for (const skillId of resolvedSkills) {
        const messages = await prisma.conversationMessage.findMany({
          where: {
            conversation: {
              projectId,
            },
            skillId,
          },
          orderBy: { createdAt: "asc" },
        });

        if (messages.length > 0) {
          const messagesText = messages
            .map((m: any) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`)
            .join("\n");

          if (messagesText.trim()) {
            sections.push({
              tag: `skill_conversation_history_${skillId.replace(/[^a-zA-Z0-9]/g, "_")}`,
              trust: "trusted",
              content: `Conversation history for skill ${skillId}:\n\n${messagesText}`,
            });
          }
        }
      }
    }
  ```

- [ ] **Step 3: Add Unit Tests in `context.test.ts`**
  Modify [context.test.ts](file:///c:/Users/patel/OneDrive/Documents/New%20project%204/apps/worker/src/assemblers/context.test.ts) to mock the `flowRun` prisma delegate and verify that `"@previous"` retrieves the preceding step's messages.
  Code to implement:
  - Add `flowRun: { findFirst: vi.fn() }` to the mocked prisma instance.
  - Add test case:
    ```typescript
      it("resolves @previous skill dynamically from flow runs", async () => {
        const mockMessages = [
          { role: "user", content: "Hello from previous skill", createdAt: new Date(1000) },
          { role: "assistant", content: "Response from previous skill", createdAt: new Date(2000) },
        ];

        vi.mocked(prisma.conversationMessage.findMany).mockResolvedValue(mockMessages as any);
        
        const mockFlowRun = {
          id: "run-1",
          currentStepKey: "step-2",
          flowVersion: {
            steps: [
              { id: "s1", key: "step-1", skillId: "first-skill", position: 1, transitionRules: { nextStepKey: "step-2" } },
              { id: "s2", key: "step-2", skillId: "second-skill", position: 2, transitionRules: {} },
            ]
          }
        };

        vi.mocked(prisma.flowRun.findFirst).mockResolvedValue(mockFlowRun as any);

        const sections = await assembleContext("p1", {
          skills: ["@previous"],
        }, "second-skill", "conv-1");

        expect(prisma.flowRun.findFirst).toHaveBeenCalledWith({
          where: { conversationId: "conv-1", projectId: "p1" },
          include: {
            flowVersion: {
              include: {
                steps: {
                  orderBy: { position: "asc" },
                },
              },
            },
          },
        });

        expect(prisma.conversationMessage.findMany).toHaveBeenCalledWith({
          where: {
            conversation: {
              projectId: "p1",
            },
            skillId: "first-skill",
          },
          orderBy: { createdAt: "asc" },
        });

        expect(sections).toHaveLength(1);
        expect(sections[0]!.tag).toBe("skill_conversation_history_first_skill");
        expect(sections[0]!.content).toContain("Conversation history for skill first-skill:");
      });
    ```

- [ ] **Step 4: Run unit tests and verify they pass**
  Run: `pnpm --filter @remorra/worker test`
  Expected: All tests pass, including the new dynamic resolver test.

- [ ] **Step 5: Run full project validation**
  Run: `pnpm check`
  Expected: Full build, typecheck, and test suite execution passes.

import { prisma } from "../lib/prisma";
import { boss } from "../lib/boss";
import { jsonValue, parseJson } from "../lib/utils";
import { selectedModelFor } from "../services/llm";
import { invokeSkill, invokeGeneralConversation } from "../assemblers/skills";
import { applyGenericExtractMappings, applyOperationsExtract } from "../services/extract-mapper.js";
import { triggerChatReportPdf } from "../services/pdf.js";
import { jsonSchemaToTableConfig } from "@remorra/contracts";
import Ajv from "ajv";

function cleanJsonString(str: string): string {
  let cleaned = str.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/i, "");
    cleaned = cleaned.replace(/\n?```$/, "");
    cleaned = cleaned.trim();
  }
  return cleaned;
}

export type Payload = Record<string, unknown> & { jobRecordId: string };

export async function handleConversation(payload: Payload) {
  const userId = String(payload.userId ?? "");
  const projectId = String(payload.projectId ?? "");
  const conversationId = String(payload.conversationId ?? "");
  const previousSkillId = payload.previousSkillId ? String(payload.previousSkillId) : undefined;
  const isGeneralChat = String(payload.fallbackMode ?? "") === "general_chat";
  console.info(
    `[worker:conversation] start project=${projectId} conversation=${conversationId} user=${userId} mode=${isGeneralChat ? "general_chat" : "skill"} skillId=${String(payload.skillId ?? "none")} skillVersionId=${String(payload.skillVersionId ?? "none")}`,
  );

  let sequence = 1;
  const jobId = payload.jobRecordId;
  let savedAssistantMsg: any = null;
  let queue: Array<{
    type: string;
    delta?: string;
    snapshot?: string;
    metadata?: any;
  }> = [];

  let flushPromise = Promise.resolve();

  const flush = async () => {
    if (queue.length === 0) return;
    const currentBatch = [...queue];
    queue = [];

    const dataToWrite = currentBatch.map((item) => ({
      jobId,
      projectId: projectId || null,
      userId: userId || null,
      sequence: sequence++,
      type: item.type,
      delta: item.delta ?? null,
      snapshot: item.snapshot ?? null,
      metadata: item.metadata ? jsonValue(item.metadata) : null,
    }));

    flushPromise = flushPromise.then(async () => {
      try {
        await prisma.jobStreamEvent.createMany({
          data: dataToWrite,
        });
      } catch (err) {
        console.error("Failed to batch write JobStreamEvents", err);
      }
    });
  };

  const timerId = setInterval(() => {
    void flush();
  }, 80);

  try {
    queue.push({
      type: "log",
      delta: "Preparing conversation context...",
      metadata: { stage: "start" },
    });
    void flush();

    const matchedSkill = isGeneralChat
      ? "General Assistant"
      : typeof payload.skillId === "string"
        ? payload.skillId
        : "General Assistant";

    queue.push({
      type: "log",
      delta: `Routing matched: ${matchedSkill}`,
      metadata: { stage: "routing", skillId: isGeneralChat ? "general_chat" : payload.skillId },
    });
    // Send picked skill info to FE
    queue.push({
      type: "info",
      delta: matchedSkill,
      metadata: { skillId: isGeneralChat ? "general_chat" : payload.skillId },
    });
    void flush();

    queue.push({
      type: "log",
      delta: "Invoking AI model and streaming response...",
      metadata: { stage: "invoking" },
    });
    void flush();

    let lastSystemPrompt = "";
    let lastLlmMessages: any = null;

    const result = isGeneralChat
      ? await invokeGeneralConversation({
          userId,
          projectId,
          conversationId,
          content: String(payload.content),
          onDelta: async (delta, accumulated) => {
            queue.push({ type: "token", delta });
            if (sequence % 15 === 0) {
              queue.push({ type: "snapshot", snapshot: accumulated });
            }
          },
        })
      : await invokeSkill({
          skillId: typeof payload.skillId === "string" ? payload.skillId : undefined,
          skillVersionId:
            typeof payload.skillVersionId === "string" ? payload.skillVersionId : undefined,
          eventType: typeof payload.eventType === "string" ? payload.eventType : undefined,
          userId,
          projectId,
          conversationId: conversationId || undefined,
          previousSkillId,
          content: String(payload.content),
          documentName: typeof payload.documentName === "string" && payload.documentName ? payload.documentName : undefined,
          documentContent: typeof payload.documentContent === "string" && payload.documentContent ? payload.documentContent : undefined,
          onDelta: async (delta, accumulated) => {
            queue.push({ type: "token", delta });
            // Occasional snapshot (approx. every 15-20 tokens)
            if (sequence % 15 === 0) {
              queue.push({ type: "snapshot", snapshot: accumulated });
            }
          },
          onLlmInput: (system, messages) => {
            lastSystemPrompt = system;
            lastLlmMessages = messages as any;
            queue.push({
              type: "log",
              delta: "LLM input assembled",
              metadata: {
                stage: "llm_input",
                system,
                messages,
              },
            });
            void flush();
          },
          onLog: (delta, metadata) => {
            queue.push({
              type: "log",
              delta,
              metadata,
            });
            void flush();
          },
        });

    queue.push({
      type: "log",
      delta: `Completed successfully. Saved response for skill: ${result.skill.id} v${result.skill.version}`,
      metadata: {
        stage: "completed",
        skillId: result.skill.id,
        version: result.skill.version,
        modelTier: result.skill.modelTier,
        model: selectedModelFor(result.skill.modelTier ?? "standard"),
        rawInput: {
          systemPrompt: lastSystemPrompt || result.skill.systemPrompt || null,
          userMessage: lastLlmMessages ? (lastLlmMessages[lastLlmMessages.length - 1]?.content ?? String(payload.content)) : String(payload.content),
        },
        rawOutput: result.text,
      },
    });
    void flush();

    console.info(
      `[worker:conversation] completed project=${projectId} conversation=${conversationId} mode=${isGeneralChat ? "general_chat" : "skill"} skillId=${result.skill.id} skillVersion=${result.skill.version}`,
    );

    clearInterval(timerId);
    await flush();

    // ── Detection 1: <skill_done/> tag ──────────────────────────────────────
    // Auto-injected into the system prompt by the worker (skills.ts).
    // Works for ANY skill — plain conversational or JSON-returning.
    // The tag is stripped from displayText so the user never sees it.
    let displayText = result.text;
    let skillIsDone = false;
    let shouldGeneratePdf = false;

    if (!isGeneralChat && displayText.includes("<generate_pdf/>")) {
      shouldGeneratePdf = true;
      displayText = displayText.replace(/<generate_pdf\/>/g, "").trim();
    }

    if (!isGeneralChat && displayText.includes("<skill_done/>")) {
      skillIsDone = true;
      displayText = displayText.replace(/<skill_done\/>/g, "").trim();
      console.info(
        `[worker:conversation] skill_done tag detected project=${projectId} conversation=${conversationId} skillId=${result.skill.id}`,
      );
    }

    // ── Detection 2: JSON response ───────────────────────────────────────────
    // Skills that return a JSON object signal completion by returning structured
    // data. Parse it, mark done, and strip raw JSON from displayText.
    let jsonParsed: unknown = null;

    function tryParseJson(str: string): unknown {
      try { return JSON.parse(str); } catch { /* ignore */ }
      try { return parseJson(str); } catch { /* ignore */ }
      return null;
    }

    if (!isGeneralChat && conversationId) {
      const cleaned = cleanJsonString(displayText);

      // Case 1: entire response is JSON
      if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
        jsonParsed = tryParseJson(cleaned);
        if (jsonParsed !== null) {
          skillIsDone = true;
          displayText = "";
        }
      }

      if (jsonParsed === null) {
        // Case 2: fenced <output_data> block embedded in prose
        const fencedMatch = displayText.match(/<output_data>\s*([\s\S]*?)\s*<\/output_data>/i);
        if (fencedMatch?.[1]) {
          jsonParsed = tryParseJson(fencedMatch[1].trim());
          if (jsonParsed !== null) {
            skillIsDone = true;
            displayText = displayText.replace(/<output_data>\s*[\s\S]*?<\/output_data>/gi, "").trim();
          }
        }
      }

      if (jsonParsed === null) {
        // Case 3: raw JSON object appended at end of prose
        const trailingMatch = displayText.match(/^([\s\S]*?)(\{[\s\S]*\})\s*$/);
        if (trailingMatch?.[2]) {
          jsonParsed = tryParseJson(trailingMatch[2].trim());
          if (jsonParsed !== null) {
            skillIsDone = true;
            displayText = (trailingMatch[1] ?? "").trim();
          }
        }
      }
    }

    // ── Validate parsed JSON against skill outputSchema (fail-closed) ─────────
    if (jsonParsed !== null) {
      const rawSchema = (result.skill as any).outputSchema;
      if (rawSchema?.type === "table" && typeof rawSchema.value === "object" && rawSchema.value !== null) {
        try {
          const ajv = new Ajv({ allErrors: true });
          const validate = ajv.compile(rawSchema.value);
          const valid = validate(jsonParsed);
          if (!valid) {
            console.warn(
              `[worker:conversation] outputSchema validation failed skillId=${result.skill.id}`,
              ajv.errorsText(validate.errors),
            );
            jsonParsed = null; // discard — do not write invalid data to DB
            skillIsDone = false;
          }
        } catch (schemaErr) {
          console.warn("[worker:conversation] outputSchema compile error — skipping validation", schemaErr);
        }
      }
    }

    // ── DB saves — collect all events fired ─────────────────────────────────
    // NOTE: completed event is pushed AFTER transition detection so frontend
    // receives skill_transition (with nextJobId) before closing the stream.
    // Each DB write fires a named event. We collect them all so we can check
    // the admin's SkillEventMapping config in one query at the end.
    // Events are only collected when skillIsDone=true (final turn of a skill).
    const firedEvents: string[] = [];

    // Save StructuredExtract (JSON skills only)
    if (jsonParsed !== null && conversationId) {
      try {
        await prisma.structuredExtract.create({
          data: { conversationId, schemaVersion: 1, payload: jsonValue(jsonParsed) },
        });
        console.info(
          `[worker:conversation] structured extract saved project=${projectId} conversation=${conversationId} skillId=${result.skill.id}`,
        );
        queue.push({
          type: "log",
          delta: `[DB] Saved structured JSON extract matching the skill schema.`,
          metadata: { stage: "db_save", payload: jsonParsed },
        });
        void flush();

        if (skillIsDone && !isGeneralChat) {
          firedEvents.push("structured_extract.create"); // ← event from this save
        }
      } catch (extractErr) {
        console.warn(
          `[worker:conversation] failed to save structured extract project=${projectId} conversation=${conversationId} error=${extractErr instanceof Error ? extractErr.message : String(extractErr)}`,
        );
        queue.push({
          type: "log",
          delta: `[DB] Warning: Failed to save structured extract: ${extractErr instanceof Error ? extractErr.message : String(extractErr)}`,
        });
        void flush();
      }
    }

    if (shouldGeneratePdf && conversationId) {
      const pdfDoc = await triggerChatReportPdf(projectId, userId, conversationId, displayText);
      displayText = displayText + `\n\n[📄 Download Generated Report](/api/v1/documents/${pdfDoc.id}/download)`;
    }

    // Save ConversationMessage (assistant turn) — skip if displayText is empty (e.g. pure JSON skill)
    if (conversationId && displayText.trim()) {
      savedAssistantMsg = await prisma.conversationMessage.create({
        data: {
          conversationId,
          role: "assistant",
          content: displayText,
          skillId:        isGeneralChat ? null : result.skill.id,
          skillVersionId: isGeneralChat ? null : (result.skill.versionId ?? null),
        },
      });
      if (skillIsDone && !isGeneralChat) {
        firedEvents.push("conversation_message.create"); // ← event from this save
      }
    }

    // Skill completion event (always added if skill is done)
    if (skillIsDone && !isGeneralChat) {
      firedEvents.push(`skill.${result.skill.id}.completed`);
    }

    // ── Skill completion: check ALL fired events against admin config ─────────
    // Query SkillEventMapping for every event that fired this turn.
    // Admin controls which event triggers the next skill — no hardcoded priority.
    // First matching mapping (by id ASC = creation order) wins.
    if (skillIsDone && !isGeneralChat && conversationId && firedEvents.length > 0) {
      try {
        console.info(
          `[worker:conversation] checking skill completion firedEvents=[${firedEvents.join(", ")}] conversation=${conversationId}`,
        );

        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { phase: true },
        });
        const currentPhase = project?.phase;

        const DRIVE_PHASE_TRANSITIONS: Record<string, string> = {
          discover: "refine",
          refine: "initiate",
          initiate: "venture",
          venture: "evolve",
        };
        const nextPhase = currentPhase ? DRIVE_PHASE_TRANSITIONS[currentPhase] : undefined;

        queue.push({
          type: "log",
          delta: `[Events] Fired events: [${firedEvents.join(", ")}]. Checking SkillEventMappings (phase: ${currentPhase})...`,
          metadata: { stage: "event", firedEvents, currentPhase },
        });
        void flush();

        const matchedMappings = await prisma.skillEventMapping.findMany({
          where: { eventType: { in: firedEvents }, active: true },
          include: { skill: { select: { phase: true } } },
          orderBy: { id: "asc" }, // admin's creation order = priority
        });

        const executeCrossPhaseTransition = async (targetMapping: any) => {
          if (!nextPhase) return;

          // Find or create conversation for the next phase
          let nextConversation = await prisma.conversation.findFirst({
            where: { projectId, kind: nextPhase as any, status: "active" },
          });
          if (!nextConversation) {
            nextConversation = await prisma.conversation.create({
              data: {
                projectId,
                kind: nextPhase as any,
                retentionUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
              },
            });
          }

          const nextVersion = await prisma.skillVersion.findFirst({
            where: { skillId: targetMapping.skillId, active: true },
            orderBy: { version: "desc" },
          });

          if (nextVersion) {
            await prisma.$transaction([
              prisma.project.update({
                where: { id: projectId },
                data: {
                  phase: nextPhase as any,
                  version: { increment: 1 },
                },
              }),
              prisma.conversation.update({
                where: { id: conversationId },
                data: {
                  activeSkillId:        null,
                  activeSkillVersionId: null,
                  activeSkillPinnedAt:  null,
                  status: "completed",
                },
              }),
              prisma.conversation.update({
                where: { id: nextConversation.id },
                data: {
                  activeSkillId:        targetMapping.skillId,
                  activeSkillVersionId: nextVersion.id,
                  activeSkillPinnedAt:  new Date(),
                },
              }),
            ]);

            let transitionText = "";
            if (currentPhase === "discover") {
              transitionText = `**Phase Advanced: Discover → Refine** 🎯\n\nAll tasks in the **Discover** phase are complete! Your project has been automatically advanced to the **Refine** phase.\n\nIn the Refine phase, we will organize your discovery notes into structured goals, group your features into epics, write detailed user stories, and detail your target user personas.\n\n*Auto-starting the first Refine task: ${nextVersion.skillId}...*`;
            } else if (currentPhase === "refine") {
              transitionText = `**Phase Advanced: Refine → Initiate** 🚀\n\nAll tasks in the **Refine** phase are complete! Your project has been automatically advanced to the **Initiate** phase.\n\nIn the Initiate phase, we will perform a comprehensive strategy check, compute your health readiness score, and identify any backlog alignment gaps.\n\n*Auto-starting the first Initiate task: ${nextVersion.skillId}...*`;
            } else if (currentPhase === "initiate") {
              transitionText = `**Phase Advanced: Initiate → Venture** 📈\n\nAll tasks in the **Initiate** phase are complete! Your project has been automatically advanced to the **Venture** phase.\n\n*Auto-starting the first Venture task: ${nextVersion.skillId}...*`;
            } else if (currentPhase === "venture") {
              transitionText = `**Phase Advanced: Venture → Evolve** 🔄\n\nAll tasks in the **Venture** phase are complete! Your project has been automatically advanced to the **Evolve** phase.\n\n*Auto-starting the first Evolve task: ${nextVersion.skillId}...*`;
            }

            // Save transition message to the next conversation
            await prisma.conversationMessage.create({
              data: {
                conversationId: nextConversation.id,
                role: "assistant",
                content: transitionText,
                skillId:        null,
                skillVersionId: null,
              },
            });

            // Enqueue next skill turn for the next conversation!
            const nextJobRecord = await prisma.jobRecord.create({
              data: {
                projectId,
                userId,
                queue: "ai.conversation",
                payload: jsonValue({
                  conversationId: nextConversation.id,
                  skillId: targetMapping.skillId,
                  skillVersionId: nextVersion.id,
                  previousSkillId: result.skill.id,
                  content: "",
                }),
              },
            });

            const nextBossJobId = await boss.send("ai.conversation", {
              conversationId: nextConversation.id,
              projectId,
              userId,
              skillId: targetMapping.skillId,
              skillVersionId: nextVersion.id,
              previousSkillId: result.skill.id,
              content: "",
              jobRecordId: nextJobRecord.id,
            });

            await prisma.jobRecord.update({
              where: { id: nextJobRecord.id },
              data: { bossJobId: nextBossJobId ?? undefined },
            });

            queue.push({
              type: "skill_transition",
              snapshot: transitionText,
              metadata: {
                completedSkillId: result.skill.id,
                nextSkillId:      targetMapping.skillId,
                triggeredByEvent: targetMapping.eventType,
                nextJobId:        nextJobRecord.id,
                advancedToPhase:  nextPhase,
              },
            });

            queue.push({
              type: "log",
              delta: `[Transition] Advanced phase to "${nextPhase}". Auto-starting next-phase skill: "${targetMapping.skillId}".`,
              metadata: {
                stage: "transition",
                completedSkillId: result.skill.id,
                nextSkillId:      targetMapping.skillId,
                triggeredByEvent: targetMapping.eventType,
                nextJobId:        nextJobRecord.id,
                advancedToPhase:  nextPhase,
              },
            });
            void flush();

            console.info(
              `[worker:conversation] next skill auto-enqueued in new phase=${nextPhase} nextSkill=${targetMapping.skillId} conversation=${nextConversation.id}`
            );
          }
        };

        // First match in the current phase box wins, otherwise check next phase
        let nextMapping = matchedMappings.find((m: any) => m.skill.phase === currentPhase) ?? null;
        let isCrossPhaseTransition = false;
        if (!nextMapping && nextPhase) {
          nextMapping = matchedMappings.find((m: any) => m.skill.phase === nextPhase) ?? null;
          if (nextMapping) {
            isCrossPhaseTransition = true;
          }
        }

        if (nextMapping) {
          if (isCrossPhaseTransition) {
            await executeCrossPhaseTransition(nextMapping);
          } else {
          // ── NEXT SKILL FOUND → pin it + auto-enqueue immediately ─────────
          const nextVersion = await prisma.skillVersion.findFirst({
            where: { skillId: nextMapping.skillId, active: true },
            orderBy: { version: "desc" },
          });

          if (nextVersion) {
            const pinnedAt = new Date();
            await prisma.conversation.update({
              where: { id: conversationId },
              data: {
                activeSkillId:        nextMapping.skillId,
                activeSkillVersionId: nextVersion.id,
                activeSkillPinnedAt:  pinnedAt,
              },
            });

            // Create job record first so we can include its ID in the transition event
            const nextJobRecord = await prisma.jobRecord.create({
              data: {
                projectId,
                userId,
                queue: "ai.conversation",
                payload: jsonValue({
                  conversationId,
                  skillId: nextMapping.skillId,
                  skillVersionId: nextVersion.id,
                  previousSkillId: result.skill.id,
                  content: displayText,
                }),
              },
            });
            const nextBossJobId = await boss.send("ai.conversation", {
              conversationId,
              projectId,
              userId,
              skillId: nextMapping.skillId,
              skillVersionId: nextVersion.id,
              previousSkillId: result.skill.id,
              content: displayText,
              jobRecordId: nextJobRecord.id,
            });
            await prisma.jobRecord.update({
              where: { id: nextJobRecord.id },
              data: { bossJobId: nextBossJobId ?? undefined },
            });

            // Emit transition events AFTER job created so nextJobId is available
            queue.push({
              type: "skill_transition",
              snapshot: "",
              metadata: {
                completedSkillId: result.skill.id,
                nextSkillId:      nextMapping.skillId,
                triggeredByEvent: nextMapping.eventType,
                nextJobId:        nextJobRecord.id,
              },
            });
            queue.push({
              type: "log",
              delta: `[Transition] Event "${nextMapping.eventType}" matched! Auto-starting skill: "${nextMapping.skillId}".`,
              metadata: {
                stage: "transition",
                completedSkillId: result.skill.id,
                nextSkillId:      nextMapping.skillId,
                triggeredByEvent: nextMapping.eventType,
                nextJobId:        nextJobRecord.id,
              },
            });
            void flush();

            console.info(
              `[worker:conversation] next skill auto-enqueued triggeredBy=${nextMapping.eventType} nextSkill=${nextMapping.skillId} conversation=${conversationId} jobId=${nextBossJobId}`,
            );
          }
        }
      } else {
          // ── NO SKILL-TO-SKILL MATCH → run DB mapper, fire DB events, check again ──
          const dbFiredEvents: string[] = [];

          if (jsonParsed !== null) {
            try {
              queue.push({
                type: "log",
                delta: `[Mapper] No skill-to-skill mapping. Running DB mapper...`,
                metadata: { stage: "mapper_start" },
              });
              void flush();

              if ((jsonParsed as any)?.operations !== undefined) {
                const rawSchema = (result.skill as any).outputSchema;
                let allowedActionsMap: Record<string, string[]> | undefined;
                if (rawSchema?.type === "table" && typeof rawSchema.value === "object" && rawSchema.value !== null) {
                  // Stored value is the generated JSON schema, not the raw
                  // per-entity map — reconstruct it before reading actions.
                  const tableConfig = jsonSchemaToTableConfig(rawSchema.value) ?? (rawSchema.value as Record<string, any>);
                  allowedActionsMap = {};
                  for (const [entity, entry] of Object.entries(tableConfig as Record<string, any>)) {
                    allowedActionsMap[entity] = Array.isArray(entry) ? ["create", "update", "delete"] : (entry?.actions ?? ["create", "update", "delete"]);
                  }
                }
                const ops = await applyOperationsExtract(projectId, userId, jsonParsed, allowedActionsMap);
                dbFiredEvents.push(...ops);
              } else {
                await applyGenericExtractMappings(projectId, userId, jsonParsed);
                // generic mapper does not return granular events — use structured_extract.create
                dbFiredEvents.push("structured_extract.create");
              }

              queue.push({
                type: "log",
                delta: `[Mapper] DB operations complete. DB events: [${dbFiredEvents.join(", ")}]`,
                metadata: { stage: "mapper_success", dbFiredEvents },
              });
              void flush();
            } catch (mapErr) {
              console.warn(`[worker:conversation] mapper error:`, mapErr);
              queue.push({
                type: "log",
                delta: `[Mapper] Warning: DB mapper failed: ${mapErr instanceof Error ? mapErr.message : String(mapErr)}`,
              });
              void flush();
            }
          }

          // Check DB-level events against SkillEventMapping
          const dbMappings = dbFiredEvents.length > 0
            ? (await prisma.skillEventMapping.findMany({
                where: { eventType: { in: dbFiredEvents }, active: true },
                include: { skill: { select: { phase: true } } },
                orderBy: { id: "asc" },
              }))
            : [];

          let dbMapping = dbMappings.find((m: any) => m.skill.phase === currentPhase) ?? null;
          let isDbCrossPhaseTransition = false;
          if (!dbMapping && nextPhase) {
            dbMapping = dbMappings.find((m: any) => m.skill.phase === nextPhase) ?? null;
            if (dbMapping) {
              isDbCrossPhaseTransition = true;
            }
          }

          if (dbMapping) {
            if (isDbCrossPhaseTransition) {
              await executeCrossPhaseTransition(dbMapping);
            } else {
            // ── DB EVENT MATCH → activate next skill ─────────────────────────
            const dbNextVersion = await prisma.skillVersion.findFirst({
              where: { skillId: dbMapping.skillId, active: true },
              orderBy: { version: "desc" },
            });

            if (dbNextVersion) {
              const pinnedAt = new Date();
              await prisma.conversation.update({
                where: { id: conversationId },
                data: {
                  activeSkillId:        dbMapping.skillId,
                  activeSkillVersionId: dbNextVersion.id,
                  activeSkillPinnedAt:  pinnedAt,
                },
              });

              const dbNextJobRecord = await prisma.jobRecord.create({
                data: {
                  projectId,
                  userId,
                  queue: "ai.conversation",
                  payload: jsonValue({
                    conversationId,
                    skillId: dbMapping.skillId,
                    skillVersionId: dbNextVersion.id,
                    previousSkillId: result.skill.id,
                    content: "",
                  }),
                },
              });
              const dbNextBossJobId = await boss.send("ai.conversation", {
                conversationId,
                projectId,
                userId,
                skillId: dbMapping.skillId,
                skillVersionId: dbNextVersion.id,
                previousSkillId: result.skill.id,
                content: "",
                jobRecordId: dbNextJobRecord.id,
              });
              await prisma.jobRecord.update({
                where: { id: dbNextJobRecord.id },
                data: { bossJobId: dbNextBossJobId ?? undefined },
              });

              queue.push({
                type: "skill_transition",
                snapshot: "",
                metadata: {
                  completedSkillId: result.skill.id,
                  nextSkillId:      dbMapping.skillId,
                  triggeredByEvent: dbMapping.eventType,
                  nextJobId:        dbNextJobRecord.id,
                },
              });
              queue.push({
                type: "log",
                delta: `[Transition] DB event "${dbMapping.eventType}" matched! Auto-starting skill: "${dbMapping.skillId}".`,
                metadata: {
                  stage: "transition",
                  completedSkillId: result.skill.id,
                  nextSkillId:      dbMapping.skillId,
                  triggeredByEvent: dbMapping.eventType,
                  nextJobId:        dbNextJobRecord.id,
                },
              });
              void flush();

              console.info(
                `[worker:conversation] next skill auto-enqueued via DB event triggeredBy=${dbMapping.eventType} nextSkill=${dbMapping.skillId} conversation=${conversationId}`,
              );
            }
          }
        } else {
            // ── NOTHING MATCHED → unpin & close session gracefully. No phase
            // change here: phase advancement is a founder-initiated action
            // (the "Continue to X" button, gated on the discover_complete/
            // pass_criteria_met flag — HARDIK doc Q10), never an automatic
            // side effect of a skill turn. If admin hasn't configured a
            // SkillEventMapping for this event, nothing more happens than
            // closing this turn cleanly.
            await prisma.conversation.update({
              where: { id: conversationId },
              data: {
                activeSkillId:        null,
                activeSkillVersionId: null,
                activeSkillPinnedAt:  null,
              },
            });

            const closingText =
              "You've completed all the steps — great work! 🎉 " +
              "Everything has been saved. Feel free to ask me anything else.";

            savedAssistantMsg = await prisma.conversationMessage.create({
              data: {
                conversationId,
                role: "assistant",
                content: closingText,
                skillId:        null,
                skillVersionId: null,
              },
            });

            queue.push({
              type: "session_complete",
              snapshot: closingText,
              metadata: { completedSkillId: result.skill.id, firedEvents, dbFiredEvents },
            });
            queue.push({
              type: "log",
              delta: `[Session] Closed session gracefully.`,
              metadata: { stage: "session_close", completedSkillId: result.skill.id, firedEvents, dbFiredEvents },
            });
            void flush();

            console.info(
              `[worker:conversation] session complete — no mapping matched firedEvents=[${firedEvents.join(", ")}] dbFiredEvents=[${dbFiredEvents.join(", ")}] skillId=${result.skill.id}`,
            );
          }
        }

      } catch (chainErr) {
        // Non-fatal — skill turn is already saved, transition failure should not break it
        console.warn(
          `[worker:conversation] skill_transition_failed skillId=${result.skill.id} error=${
            chainErr instanceof Error ? chainErr.message : String(chainErr)
          }`,
        );
        queue.push({
          type: "log",
          delta: `[Transition] Error: Failed skill transition: ${chainErr instanceof Error ? chainErr.message : String(chainErr)}`,
        });
        void flush();
      }
    }

    let savedUserMsg: any = null;
    if (conversationId) {
      savedUserMsg = await prisma.conversationMessage.findFirst({
        where: {
          conversationId,
          role: "user",
          content: String(payload.content),
        },
        orderBy: { createdAt: "desc" },
      });
    }

    // Push completed LAST — after skill_transition so frontend gets nextJobId first
    queue.push({
      type: "completed",
      snapshot: displayText,
      metadata: {
        modelTier: result.skill.modelTier,
        model: selectedModelFor(result.skill.modelTier ?? "standard"),
        outputTokens: result.text.length / 4,
        skillDone: skillIsDone,
        rawInput: {
          systemPrompt: result.skill.systemPrompt ?? null,
          userMessage: String(payload.content),
        },
        rawOutput: result.text,
        messages: [
          savedUserMsg ? {
            id: savedUserMsg.id,
            role: "user",
            content: savedUserMsg.content,
            createdAt: savedUserMsg.createdAt.toISOString(),
            documentName: savedUserMsg.documentName,
          } : null,
          savedAssistantMsg ? {
            id: savedAssistantMsg.id,
            role: "assistant",
            content: savedAssistantMsg.content,
            createdAt: savedAssistantMsg.createdAt.toISOString(),
          } : null,
        ].filter(Boolean),
      },
    });
    await flush();
    await flushPromise;

    return {
      response: result.text,
      responseStored: Boolean(conversationId),
      skillId: result.skill.id,
      skillVersion: result.skill.version,
    };
  } catch (err: any) {
    clearInterval(timerId);
    await flush();

    const message = err instanceof Error ? err.message : "Unknown error";
    queue.push({
      type: "failed",
      delta: message,
      metadata: {
        errorClass: err.constructor?.name ?? "Error",
      },
    });
    await flush();
    await flushPromise;

    console.error(
      `[worker:conversation] failed project=${projectId} conversation=${conversationId} mode=${isGeneralChat ? "general_chat" : "skill"} error=${err instanceof Error ? err.message : "Unknown error"}`,
    );
    throw err;
  }
}



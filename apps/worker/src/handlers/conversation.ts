import { prisma } from "../lib/prisma";
import { jsonValue, parseJson, parseAndValidateJson } from "../lib/utils";
import { selectedModelFor } from "../services/llm";
import { projectContext } from "../assemblers/context";
import { invokeSkill, invokeGeneralConversation } from "../assemblers/skills";
import { applyGenericExtractMappings } from "../services/extract-mapper";

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
  const isGeneralChat = String(payload.fallbackMode ?? "") === "general_chat";
  console.info(
    `[worker:conversation] start project=${projectId} conversation=${conversationId} user=${userId} mode=${isGeneralChat ? "general_chat" : "skill"} skillId=${String(payload.skillId ?? "none")} skillVersionId=${String(payload.skillVersionId ?? "none")}`,
  );

  let sequence = 1;
  const jobId = payload.jobRecordId;
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

    const flowState = isGeneralChat
      ? null
      : typeof payload.flowRunId === "string"
        ? await prepareFlowTurn(payload)
        : null;

    if (flowState) {
      queue.push({
        type: "log",
        delta: `Preparing flow step: ${flowState.questionFieldKey ?? "active step"}`,
        metadata: { stage: "flow", flowRunId: flowState.flowRunId, stepId: flowState.flowStepId },
      });
      void flush();
    }

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
          content: String(payload.content),
          context: flowState?.context ?? (await projectContext(projectId)),
          documentName: typeof payload.documentName === "string" && payload.documentName ? payload.documentName : undefined,
          documentContent: typeof payload.documentContent === "string" && payload.documentContent ? payload.documentContent : undefined,
          onDelta: async (delta, accumulated) => {
            queue.push({ type: "token", delta });
            // Occasional snapshot (approx. every 15-20 tokens)
            if (sequence % 15 === 0) {
              queue.push({ type: "snapshot", snapshot: accumulated });
            }
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
          systemPrompt: result.skill.systemPrompt ?? null,
          userMessage: String(payload.content),
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

    if (!isGeneralChat && result.text.includes("<skill_done/>")) {
      skillIsDone = true;
      displayText = result.text.replace(/<skill_done\/>/g, "").trim();
      console.info(
        `[worker:conversation] skill_done tag detected project=${projectId} conversation=${conversationId} skillId=${result.skill.id}`,
      );
    }

    // ── Detection 2: JSON response ───────────────────────────────────────────
    // Skills that return a JSON object signal completion by returning structured
    // data. Parse it, mark done, and replace raw JSON with a friendly message.
    let jsonParsed: unknown = null;
    if (!isGeneralChat && conversationId) {
      const cleaned = cleanJsonString(displayText);
      if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
        try {
          jsonParsed = JSON.parse(cleaned);
        } catch {
          try {
            jsonParsed = parseJson(cleaned);
          } catch {
            /* not JSON */
          }
        }
        if (jsonParsed !== null) {
          skillIsDone = true;
          displayText =
            "I've captured everything I need. Your product idea is saved — you can now generate your Founder Pack or continue refining.";
        }
      }
    }

    // Push SSE completed event to frontend (streaming is done)
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
      },
    });
    await flush();
    await flushPromise;

    // ── DB saves — collect all events fired ─────────────────────────────────
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

        // Run the generic table mapper
        try {
          queue.push({
            type: "log",
            delta: `[Mapper] Parsing JSON structures to update Project, Persona, Ambition, etc...`,
            metadata: { stage: "mapper_start" },
          });
          void flush();

          await applyGenericExtractMappings(projectId, jsonParsed);

          queue.push({
            type: "log",
            delta: `[Mapper] Successfully synced and updated database entities.`,
            metadata: { stage: "mapper_success" },
          });
          void flush();
        } catch (mapErr) {
          console.warn(`[worker:conversation] generic mapper error:`, mapErr);
          queue.push({
            type: "log",
            delta: `[Mapper] Warning: Mapping JSON to tables failed: ${mapErr instanceof Error ? mapErr.message : String(mapErr)}`,
          });
          void flush();
        }

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

    // Save ConversationMessage (assistant turn)
    if (conversationId) {
      await prisma.conversationMessage.create({
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

    if (flowState?.questionFieldKey) {
      await prisma.questionLedger.create({
        data: {
          flowRunId: flowState.flowRunId,
          stepRunId: flowState.questionStepRunId,
          fieldKey: flowState.questionFieldKey,
          question: result.text,
        },
      });
    }

    if (flowState?.completeAfterResponse) {
      await completeFlowStep(flowState.flowRunId, flowState.flowStepId, flowState.outputs);
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

        queue.push({
          type: "log",
          delta: `[Events] Fired events: [${firedEvents.join(", ")}]. Checking SkillEventMappings...`,
          metadata: { stage: "event", firedEvents },
        });
        void flush();

        const matchedMappings = await prisma.skillEventMapping.findMany({
          where: { eventType: { in: firedEvents }, active: true },
          orderBy: { id: "asc" }, // admin's creation order = priority
        });

        // First match wins — fully admin-driven, no static priority in code
        const nextMapping = matchedMappings[0] ?? null;

        if (nextMapping) {
          // ── NEXT SKILL FOUND → pin it, wait for user's next message ──────
          const nextVersion = await prisma.skillVersion.findFirst({
            where: { skillId: nextMapping.skillId, active: true },
            orderBy: { version: "desc" },
          });

          if (nextVersion) {
            await prisma.conversation.update({
              where: { id: conversationId },
              data: {
                activeSkillId:        nextMapping.skillId,
                activeSkillVersionId: nextVersion.id,
                activeSkillPinnedAt:  new Date(),
              },
            });

            queue.push({
              type: "skill_transition",
              snapshot: "",
              metadata: {
                completedSkillId: result.skill.id,
                nextSkillId:      nextMapping.skillId,
                triggeredByEvent: nextMapping.eventType, // which event matched
              },
            });

            queue.push({
              type: "log",
              delta: `[Transition] Event "${nextMapping.eventType}" matched! Pinned next skill: "${nextMapping.skillId}".`,
              metadata: {
                stage: "transition",
                completedSkillId: result.skill.id,
                nextSkillId:      nextMapping.skillId,
                triggeredByEvent: nextMapping.eventType,
              },
            });
            void flush();

            console.info(
              `[worker:conversation] next skill pinned triggeredBy=${nextMapping.eventType} nextSkill=${nextMapping.skillId} conversation=${conversationId}`,
            );
          }

        } else {
          // ── NO MATCH → unpin + close session gracefully ───────────────────
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

          await prisma.conversationMessage.create({
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
            metadata: {
              completedSkillId: result.skill.id,
              firedEvents,
            },
          });

          queue.push({
            type: "log",
            delta: `[Session] No matching event mappings. Closed session gracefully.`,
            metadata: {
              stage: "session_close",
              completedSkillId: result.skill.id,
              firedEvents,
            },
          });
          void flush();

          console.info(
            `[worker:conversation] session complete — no mapping matched firedEvents=[${firedEvents.join(", ")}] skillId=${result.skill.id}`,
          );
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

export async function prepareFlowTurn(payload: Payload) {
  const flowRunId = String(payload.flowRunId);
  const requestedStepRunId = String(payload.flowStepRunId ?? "");
  const run = await prisma.flowRun.findUniqueOrThrow({
    where: { id: flowRunId },
    include: {
      flowVersion: { include: { steps: { orderBy: { position: "asc" } } } },
      stepRuns: true,
    },
  });
  const activeStep = run.flowVersion.steps.find((step: any) => step.key === run.currentStepKey);
  if (!activeStep) throw new Error("Flow has no active step.");
  const activeStepRun = run.stepRuns.find((item: any) => item.flowStepId === activeStep.id);
  if (!activeStepRun || (requestedStepRunId && activeStepRun.id !== requestedStepRunId)) {
    throw new Error("Flow step changed before this job started.");
  }
  let context = { ...(run.context as Record<string, unknown>) };
  let outputs: Record<string, unknown> = {};
  const isAction = payload.flowAction === true;

  if (!isAction) {
    await prisma.questionLedger.updateMany({
      where: { flowRunId: run.id, status: "asked" },
      data: {
        answer: String(payload.content ?? ""),
        status: "answered",
        answeredAt: new Date(),
      },
    });
  }

  if (!isAction && activeStep.executionMode === "visible_chat") {
    const helper = run.flowVersion.steps.find(
      (step: any) =>
        step.parentStepKey === activeStep.key &&
        step.executionMode === "internal_helper" &&
        step.skillId,
    );
    if (helper) {
      let helperRun = run.stepRuns.find((item: any) => item.flowStepId === helper.id);
      if (!helperRun) {
        const helperVersion = await prisma.skillVersion.findFirstOrThrow({
          where: { skillId: helper.skillId!, active: true },
          orderBy: { version: "desc" },
        });
        helperRun = await prisma.flowStepRun.create({
          data: {
            flowRunId: run.id,
            flowStepId: helper.id,
            skillVersionId: helperVersion.id,
            status: "active",
            inputSnapshot: context,
            producedOutputs: {},
            missingOutputs: [],
            startedAt: new Date(),
          },
        });
      }
      const required = requiredFlowKeys(activeStep.requiredOutputs);
      const extraction = await invokeSkill({
        skillId: helper.skillId!,
        skillVersionId: helperRun.skillVersionId ?? undefined,
        userId: String(payload.userId),
        projectId: String(payload.projectId),
        content: [
          "Extract a flat JSON object from the latest user answer.",
          `Allowed keys: ${required.join(", ")}.`,
          "Only include supported values. Arrays are allowed. Return JSON only.",
          `Latest answer: ${String(payload.content ?? "")}`,
        ].join("\n"),
        context: { existingContext: context, requiredOutputs: required },
      });
      try {
        const parsed = parseAndValidateJson(
          extraction.text,
          {},
        ) as Record<string, unknown>;
        outputs = Object.fromEntries(
          Object.entries(parsed).filter(
            ([key, value]) => required.includes(key) && hasFlowValue(value),
          ),
        );
        context = { ...context, ...outputs };
      } catch {
        outputs = {};
      }
      await prisma.flowStepRun.update({
        where: { id: helperRun.id },
        data: {
          status: "completed",
          producedOutputs: jsonValue(outputs),
          completedAt: new Date(),
        },
      });
    }
  } else if (isAction && payload.actionOutputs && typeof payload.actionOutputs === "object") {
    outputs = payload.actionOutputs as Record<string, unknown>;
    context = { ...context, ...outputs };
  }

  const missing = requiredFlowKeys(activeStep.requiredOutputs).filter(
    (key) => !hasFlowValue(context[key]),
  );
  await prisma.$transaction([
    prisma.flowRun.update({
      where: { id: run.id },
      data: { context: jsonValue(context), version: { increment: 1 } },
    }),
    prisma.flowStepRun.update({
      where: { id: activeStepRun.id },
      data: { producedOutputs: jsonValue(outputs), missingOutputs: missing },
    }),
  ]);

  const complete = isAction || missing.length === 0;
  let responseStep = activeStep;
  let responseStepRun = activeStepRun;
  let questionFieldKey = complete ? null : missing[0] ?? null;
  let questionStepRunId: string | null = activeStepRun.id;
  if (complete && !isAction) {
    const nextKey = flowNextStepKey(activeStep);
    const next = nextKey
      ? run.flowVersion.steps.find((step: any) => step.key === nextKey && !step.parentStepKey)
      : null;
    if (next?.executionMode === "visible_chat" && next.skillId) {
      const version = await prisma.skillVersion.findFirstOrThrow({
        where: { skillId: next.skillId, active: true },
        orderBy: { version: "desc" },
      });
      responseStep = next;
      responseStepRun = {
        skillVersionId: version.id,
      } as any;
      questionFieldKey =
        requiredFlowKeys(next.requiredOutputs).find((key) => !hasFlowValue(context[key])) ?? null;
      questionStepRunId = null;
    }
  }

  return {
    flowRunId: run.id,
    flowStepId: activeStep.id,
    skillId: responseStep.skillId ?? activeStep.skillId!,
    skillVersionId: responseStepRun.skillVersionId ?? undefined,
    context: {
      ...(await projectContext(run.projectId)),
      guidedFlow: {
        currentStep: responseStep.displayName,
        capturedContext: context,
        missingOutputs: complete ? [] : missing,
        instruction: complete
          ? "Acknowledge the completed step and ask the first single question for the next step."
          : "Ask exactly one concise question for the most important missing output.",
      },
    },
    outputs,
    completeAfterResponse: complete,
    questionFieldKey,
    questionStepRunId,
  };
}

export async function completeFlowStep(
  flowRunId: string,
  flowStepId: string,
  outputs: Record<string, unknown>,
) {
  await prisma.$transaction(async (tx: any) => {
    const run = await tx.flowRun.findUniqueOrThrow({
      where: { id: flowRunId },
      include: { flowVersion: { include: { steps: { orderBy: { position: "asc" } } } } },
    });
    const step = run.flowVersion.steps.find((item: any) => item.id === flowStepId);
    if (!step || run.currentStepKey !== step.key) return;
    const context = { ...(run.context as Record<string, unknown>), ...outputs };
    await tx.flowStepRun.update({
      where: { flowRunId_flowStepId: { flowRunId, flowStepId } },
      data: {
        status: "completed",
        producedOutputs: jsonValue(outputs),
        missingOutputs: [],
        completedAt: new Date(),
      },
    });
    const nextKey = flowNextStepKey(step);
    const next = nextKey
      ? run.flowVersion.steps.find((item: any) => item.key === nextKey && !item.parentStepKey)
      : null;
    if (!next) {
      await tx.flowRun.update({
        where: { id: flowRunId },
        data: {
          context: jsonValue(context),
          currentStepKey: null,
          status: "completed",
          completedAt: new Date(),
          version: { increment: 1 },
        },
      });
      return;
    }
    const skillVersion = next.skillId
      ? await tx.skillVersion.findFirst({
          where: { skillId: next.skillId, active: true },
          orderBy: { version: "desc" },
        })
      : null;
    await tx.flowStepRun.upsert({
      where: { flowRunId_flowStepId: { flowRunId, flowStepId: next.id } },
      create: {
        flowRunId,
        flowStepId: next.id,
        skillVersionId: skillVersion?.id,
        status: "active",
        inputSnapshot: jsonValue(context),
        producedOutputs: {},
        missingOutputs: requiredFlowKeys(next.requiredOutputs).filter(
          (key) => !hasFlowValue(context[key]),
        ),
        startedAt: new Date(),
      },
      update: { status: "active", startedAt: new Date() },
    });
    await tx.flowRun.update({
      where: { id: flowRunId },
      data: { context: jsonValue(context), currentStepKey: next.key, version: { increment: 1 } },
    });
  });
}

function requiredFlowKeys(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function flowNextStepKey(step: any): string | null {
  return typeof step.transitionRules?.nextStepKey === "string"
    ? step.transitionRules.nextStepKey
    : null;
}

function hasFlowValue(value: unknown) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    (!Array.isArray(value) || value.length > 0)
  );
}

// applyGenericExtractMappings has been refactored and is now imported from ../services/extract-mapper


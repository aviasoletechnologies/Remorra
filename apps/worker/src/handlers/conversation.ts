import { prisma } from "../lib/prisma";
import { boss } from "../lib/boss";
import { encrypt, decrypt } from "../lib/crypto";
import { jsonValue, parseJson, parseAndValidateJson } from "../lib/utils";
import { modelFor } from "../services/llm";
import { projectContext } from "../assemblers/context";
import { invokeSkill, invokeGeneralConversation } from "../assemblers/skills";

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
        model: modelFor(result.skill.modelTier),
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
    // Legacy pattern: Brain Dump Facilitator and similar skills that return a
    // JSON object when they have collected all required topics. Save structured
    // data and replace the raw JSON with a friendly confirmation message.
    if (!isGeneralChat && conversationId) {
      const trimmed = displayText.trim(); // use cleaned text after tag strip
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          try {
            parsed = parseJson(trimmed);
          } catch {
            /* not JSON */
          }
        }
        if (parsed !== null) {
          skillIsDone = true; // JSON response also marks skill done
          try {
            await prisma.structuredExtract.create({
              data: { conversationId, schemaVersion: 1, payload: jsonValue(parsed) },
            });
            console.info(
              `[worker:conversation] structured extract saved project=${projectId} conversation=${conversationId} skillId=${result.skill.id}`,
            );
          } catch (extractErr) {
            console.warn(
              `[worker:conversation] failed to save structured extract project=${projectId} conversation=${conversationId} error=${extractErr instanceof Error ? extractErr.message : String(extractErr)}`,
            );
          }
          displayText =
            "I've captured everything I need. Your product idea is saved — you can now generate your Founder Pack or continue refining.";
        }
      }
    }

    queue.push({
      type: "completed",
      snapshot: displayText,
      metadata: {
        modelTier: result.skill.modelTier,
        model: modelFor(result.skill.modelTier),
        outputTokens: result.text.length / 4,
        skillDone: skillIsDone, // true = skill fully finished; false = just one turn done
      },
    });
    await flush();
    await flushPromise;

    if (conversationId) {
      await prisma.conversationMessage.create({
        data: {
          conversationId,
          role: "assistant",
          encryptedContent: encrypt(displayText),
        },
      });
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

    // ── Skill completion chaining ────────────────────────────────────────────
    // When a skill signals it is fully done (via <skill_done/> tag or JSON),
    // fire a "skill.{skillId}.completed" event. If the admin has mapped this
    // event type to another skill, automatically enqueue that chained job.
    if (skillIsDone && !isGeneralChat) {
      try {
        const completionEventType = `skill.${result.skill.id}.completed`;
        const chainedMappings = await prisma.skillEventMapping.findMany({
          where: { eventType: completionEventType, active: true },
        });

        for (const mapping of chainedMappings) {
          const chainedJob = await prisma.jobRecord.create({
            data: {
              queue: mapping.targetQueue,
              payload: {
                skillId: mapping.skillId,
                eventType: completionEventType,
                projectId: projectId || null,
                userId: userId || null,
                conversationId: conversationId || null,
              },
              projectId: projectId || null,
              userId: userId || null,
              runAfter: new Date(),
            },
          });
          await boss.send(
            mapping.targetQueue,
            { ...chainedJob, jobRecordId: chainedJob.id },
            { retryLimit: 4, retryBackoff: true, expireInMinutes: 15 },
          );
          console.info(
            `[worker:conversation] chained job enqueued eventType=${completionEventType} targetSkill=${mapping.skillId} jobId=${chainedJob.id}`,
          );
        }

        if (chainedMappings.length > 0) {
          console.info(
            `[worker:conversation] skill_completion_event fired eventType=${completionEventType} chainedJobs=${chainedMappings.length} project=${projectId}`,
          );
        }
      } catch (chainErr) {
        // Non-fatal: skill response is already saved, chaining failure should not break the turn
        console.warn(
          `[worker:conversation] skill_completion_chain_failed skillId=${result.skill.id} error=${chainErr instanceof Error ? chainErr.message : String(chainErr)}`,
        );
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

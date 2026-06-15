import { BadRequestException, Injectable } from "@nestjs/common";
import { CryptoService } from "../../infrastructure/crypto.service.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";

@Injectable()
export class WorkspaceFlowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly access: ProjectAccessService,
    private readonly queue: QueueService,
  ) {}

  async getOrCreate(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    let run = await this.loadRun(projectId);
    if (!run) {
      run = await this.createRun(projectId);
    }
    return this.serialize(run);
  }

  async message(projectId: string, userId: string, rawContent: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const content = rawContent.trim();
    if (!content) throw new BadRequestException("Message content is required.");
    const run = (await this.loadRun(projectId)) ?? (await this.createRun(projectId));
    const step = this.currentStep(run);
    if (!step || step.executionMode !== "visible_chat" || !step.skillId) {
      throw new BadRequestException("The current flow step requires an explicit action, not a chat message.");
    }
    const stepRun = run.stepRuns.find((item: any) => item.flowStepId === step.id);
    if (!stepRun?.skillVersionId) {
      throw new BadRequestException("The current skill has no pinned active version.");
    }
    await this.prisma.client.conversationMessage.create({
      data: {
        conversationId: run.conversationId,
        actorId: userId,
        role: "user",
        encryptedContent: this.crypto.encrypt(content),
      },
    });
    return this.queue.enqueue({
      queue: QUEUES.aiConversation,
      projectId,
      userId,
      payload: {
        conversationId: run.conversationId,
        flowRunId: run.id,
        flowStepRunId: stepRun.id,
        skillId: step.skillId,
        skillVersionId: stepRun.skillVersionId,
        content,
      },
    });
  }

  async action(
    projectId: string,
    userId: string,
    body: { outputs?: Record<string, unknown>; note?: string },
  ) {
    await this.access.require(projectId, userId, ["founder"]);
    const run = (await this.loadRun(projectId)) ?? (await this.createRun(projectId));
    const step = this.currentStep(run);
    if (!step || step.executionMode === "visible_chat" || step.executionMode === "internal_helper") {
      throw new BadRequestException("The current step does not accept this action.");
    }
    const stepRun = run.stepRuns.find((item: any) => item.flowStepId === step.id);
    const required = requiredKeys(step.requiredOutputs);
    const supplied = body.outputs ?? {};
    const outputs = Object.fromEntries(
      required.map((key) => [key, supplied[key] ?? true]),
    );

    if (step.executionMode === "explicit_action" && step.skillId && stepRun?.skillVersionId) {
      return this.queue.enqueue({
        queue: QUEUES.aiConversation,
        projectId,
        userId,
        payload: {
          conversationId: run.conversationId,
          flowRunId: run.id,
          flowStepRunId: stepRun.id,
          flowAction: true,
          skillId: step.skillId,
          skillVersionId: stepRun.skillVersionId,
          actionOutputs: outputs,
          content: body.note?.trim() || `Complete the "${step.displayName}" step using the confirmed project context.`,
        },
      });
    }

    await this.completeAndAdvance(run.id, step.id, outputs);
    return this.getOrCreate(projectId, userId);
  }

  private loadRun(projectId: string) {
    return this.prisma.client.flowRun.findFirst({
      where: { projectId, status: "active" },
      orderBy: { createdAt: "desc" },
      include: {
        conversation: { include: { messages: { orderBy: { createdAt: "asc" } } } },
        flowVersion: { include: { definition: true, steps: { orderBy: { position: "asc" } } } },
        stepRuns: { include: { skillVersion: true } },
        questions: { orderBy: { askedAt: "asc" } },
      },
    });
  }

  private async createRun(projectId: string) {
    const version = await this.prisma.client.flowVersion.findFirst({
      where: { status: "published", definition: { active: true } },
      orderBy: [{ publishedAt: "desc" }, { version: "desc" }],
      include: { steps: { orderBy: { position: "asc" } } },
    });
    if (!version) throw new BadRequestException("No published product journey is available.");
    const first = version.steps.find((step: any) => !step.parentStepKey);
    if (!first) throw new BadRequestException("The published product journey has no entry step.");
    await this.prisma.client.$transaction(async (tx: any) => {
      const conversation = await tx.conversation.create({
        data: {
          projectId,
          kind: "workspace",
          retentionUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      });
      const run = await tx.flowRun.create({
        data: {
          projectId,
          conversationId: conversation.id,
          flowVersionId: version.id,
          currentStepKey: first.key,
          context: {},
        },
      });
      await this.createStepRun(tx, run.id, first, {});
    });
    return this.loadRun(projectId);
  }

  private async completeAndAdvance(
    runId: string,
    stepId: string,
    outputs: Record<string, unknown>,
  ) {
    await this.prisma.client.$transaction(async (tx: any) => {
      const run = await tx.flowRun.findUniqueOrThrow({
        where: { id: runId },
        include: { flowVersion: { include: { steps: { orderBy: { position: "asc" } } } } },
      });
      const step = run.flowVersion.steps.find((item: any) => item.id === stepId);
      const context = { ...(run.context as Record<string, unknown>), ...outputs };
      await tx.flowStepRun.update({
        where: { flowRunId_flowStepId: { flowRunId: run.id, flowStepId: step.id } },
        data: {
          status: "completed",
          producedOutputs: outputs,
          missingOutputs: [],
          completedAt: new Date(),
        },
      });
      const nextKey = nextStepKey(step);
      const next = nextKey
        ? run.flowVersion.steps.find((item: any) => item.key === nextKey && !item.parentStepKey)
        : null;
      if (!next) {
        await tx.flowRun.update({
          where: { id: run.id },
          data: { context, currentStepKey: null, status: "completed", completedAt: new Date(), version: { increment: 1 } },
        });
        return;
      }
      await this.createStepRun(tx, run.id, next, context);
      await tx.flowRun.update({
        where: { id: run.id },
        data: { context, currentStepKey: next.key, version: { increment: 1 } },
      });
    });
  }

  private async createStepRun(tx: any, flowRunId: string, step: any, context: Record<string, unknown>) {
    const skillVersion = step.skillId
      ? await tx.skillVersion.findFirst({
          where: { skillId: step.skillId, active: true },
          orderBy: { version: "desc" },
        })
      : null;
    const missing = requiredKeys(step.requiredOutputs).filter((key) => !hasValue(context[key]));
    return tx.flowStepRun.upsert({
      where: { flowRunId_flowStepId: { flowRunId, flowStepId: step.id } },
      create: {
        flowRunId,
        flowStepId: step.id,
        skillVersionId: skillVersion?.id,
        status: "active",
        inputSnapshot: context,
        producedOutputs: {},
        missingOutputs: missing,
        startedAt: new Date(),
      },
      update: { status: "active", missingOutputs: missing, startedAt: new Date() },
    });
  }

  private currentStep(run: any) {
    return run.flowVersion.steps.find((step: any) => step.key === run.currentStepKey);
  }

  private serialize(run: any) {
    const currentStep = this.currentStep(run);
    const currentStepRun = currentStep
      ? run.stepRuns.find((item: any) => item.flowStepId === currentStep.id)
      : null;
    return {
      id: run.id,
      status: run.status,
      version: run.version,
      context: run.context,
      flow: {
        id: run.flowVersion.definition.id,
        name: run.flowVersion.definition.name,
        version: run.flowVersion.version,
      },
      currentStep: currentStep
        ? {
            ...currentStep,
            skillVersion: currentStepRun?.skillVersion?.version ?? null,
            missingOutputs: currentStepRun?.missingOutputs ?? [],
          }
        : null,
      steps: run.flowVersion.steps
        .filter((step: any) => !step.parentStepKey)
        .map((step: any) => ({
          key: step.key,
          displayName: step.displayName,
          executionMode: step.executionMode,
          position: step.position,
          status: run.stepRuns.find((item: any) => item.flowStepId === step.id)?.status ?? "pending",
        })),
      messages: run.conversation.messages.map((message: any) => ({
        id: message.id,
        role: message.role,
        content: this.crypto.decrypt(message.encryptedContent),
        createdAt: message.createdAt,
      })),
      questions: run.questions,
    };
  }
}

export function requiredKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (value && typeof value === "object" && Array.isArray((value as any).fields)) {
    return (value as any).fields.filter((item: unknown): item is string => typeof item === "string");
  }
  return [];
}

export function nextStepKey(step: any): string | null {
  const rules = step.transitionRules as Record<string, unknown> | null;
  return typeof rules?.nextStepKey === "string" ? rules.nextStepKey : null;
}

export function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "" &&
    (!Array.isArray(value) || value.length > 0);
}

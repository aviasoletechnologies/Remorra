import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { createEvolveSessionSchema } from "@remorra/contracts";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { CryptoService } from "../../infrastructure/crypto.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";
import { versionConflict } from "../../shared/http-errors.js";
import { ViabilityService } from "../viability/viability.service.js";

export function assertConversationAllowed(mode: "ideate" | "publish") {
  if (mode === "publish") {
    throw new ForbiddenException("Publish sessions do not allow conversation.");
  }
}

@Injectable()
export class EvolveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly access: ProjectAccessService,
    private readonly queue: QueueService,
    private readonly viability: ViabilityService,
  ) {}

  async create(input: unknown, userId: string) {
    const parsed = createEvolveSessionSchema.parse(input);
    await this.access.require(parsed.projectId, userId, ["founder"]);
    const project = await this.prisma.client.project.findUniqueOrThrow({
      where: { id: parsed.projectId },
    });
    return this.prisma.client.$transaction(async (tx: any) => {
      const conversation =
        parsed.mode === "ideate"
          ? await tx.conversation.create({
              data: {
                projectId: parsed.projectId,
                kind: "evolve",
                retentionUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
              },
            })
          : null;
      return tx.evolveSession.create({
        data: {
          projectId: parsed.projectId,
          conversationId: conversation?.id,
          mode: parsed.mode,
          status: parsed.mode === "publish" ? "screening" : "active",
          topic: parsed.topic,
          launchedFrom: parsed.launchedFrom,
          continuedFromSessionId: parsed.continuedFromSessionId,
          baseProjectVersion: project.version,
        },
      });
    });
  }

  async get(id: string, userId: string) {
    const session = await this.require(id, userId);
    const [messages, impacts] = await Promise.all([
      session.conversationId
        ? this.prisma.client.conversationMessage.findMany({
            where: { conversationId: session.conversationId },
            orderBy: { createdAt: "asc" },
          })
        : [],
      this.prisma.client.impactItem.findMany({
        where: { evolveSessionId: id },
        orderBy: { id: "asc" },
      }),
    ]);
    return {
      ...session,
      messages: messages.map((message: any) => ({
        id: message.id,
        role: message.role,
        content: this.crypto.decrypt(message.encryptedContent),
        createdAt: message.createdAt,
      })),
      impacts,
    };
  }

  async message(id: string, userId: string, content: string) {
    const session = await this.require(id, userId);
    assertConversationAllowed(session.mode);
    if (!session.conversationId) {
      throw new BadRequestException("Evolve conversation is unavailable.");
    }
    await this.prisma.client.conversationMessage.create({
      data: {
        conversationId: session.conversationId,
        actorId: userId,
        role: "user",
        encryptedContent: this.crypto.encrypt(content),
      },
    });
    return this.queue.enqueue({
      queue: QUEUES.aiConversation,
      projectId: session.projectId,
      userId,
      payload: {
        eventType: "evolve.message",
        evolveSessionId: id,
        conversationId: session.conversationId,
        content,
      },
    });
  }

  async screen(id: string, userId: string) {
    const session = await this.require(id, userId);
    await this.prisma.client.evolveSession.update({
      where: { id },
      data: { status: "screening" },
    });
    return this.queue.enqueue({
      queue: QUEUES.aiExtract,
      projectId: session.projectId,
      userId,
      idempotencyKey: `evolve-screen:${id}`,
      payload: { eventType: "evolve.screen", evolveSessionId: id },
    });
  }

  async decide(
    id: string,
    impactId: string,
    decision: "approved" | "rejected",
    userId: string,
  ) {
    await this.require(id, userId);
    const impact = await this.prisma.client.impactItem.findFirstOrThrow({
      where: { id: impactId, evolveSessionId: id },
    });
    return this.prisma.client.impactItem.update({
      where: { id: impact.id },
      data: { decision },
    });
  }

  async complete(id: string, currentProjectVersion: number, userId: string) {
    const session = await this.require(id, userId);
    if (session.baseProjectVersion !== currentProjectVersion) {
      versionConflict(currentProjectVersion);
    }
    const impacts = await this.prisma.client.impactItem.findMany({
      where: { evolveSessionId: id },
    });
    if (impacts.some((item: any) => item.decision === "pending")) {
      throw new BadRequestException(
        "Every impact item needs a founder decision.",
      );
    }
    if (impacts.some((item: any) => ["conflict", "blocked"].includes(item.status))) {
      throw new BadRequestException(
        "Every conflict or block must be resolved before committing.",
      );
    }
    const result = await this.prisma.client.$transaction(async (tx: any) => {
      const project = await tx.project.findUniqueOrThrow({
        where: { id: session.projectId },
        select: { version: true },
      });
      if (project.version !== currentProjectVersion) {
        versionConflict(project.version);
      }
      const approved = impacts.filter(
        (item: any) => item.decision === "approved",
      );
      const mutations = [];
      for (const impact of approved) {
        mutations.push(await this.applyImpact(tx, session.projectId, impact));
      }
      await this.assertConnectedProductThread(tx, session.projectId);
      const nextProject = await tx.project.update({
        where: {
          id: session.projectId,
          version: currentProjectVersion,
        },
        data: { version: { increment: 1 } },
        select: { version: true },
      });
      await tx.evolveSession.update({
        where: { id },
        data: {
          status: "completed",
          completedAt: new Date(),
          approvedSummary: `${approved.length} changes approved`,
        },
      });
      await tx.auditEvent.create({
        data: {
          projectId: session.projectId,
          actorId: userId,
          eventType: "evolve.completed",
          metadata: {
            sessionId: id,
            approved: approved.map((item: any) => item.id),
            mutations,
            projectVersion: nextProject.version,
          },
        },
      });
      return {
        sessionId: id,
        committed: approved.length,
        projectVersion: nextProject.version,
      };
    });

    await this.viability.autoRecalculate(session.projectId, userId).catch((err) => {
      console.error("Failed to trigger autoRecalculate in EvolveService", err);
    });

    return result;
  }

  async resolve(
    id: string,
    impactId: string,
    resolution: "accept" | "keep_current" | "edit_payload" | "retarget" | "split" | "reject",
    note: string | undefined,
    payload: any | undefined,
    userId: string,
  ) {
    const session = await this.require(id, userId);
    const impact = await this.prisma.client.impactItem.findFirstOrThrow({
      where: { id: impactId, evolveSessionId: id },
    });

    await this.prisma.client.$transaction(async (tx: any) => {
      if (resolution === "accept") {
        await tx.impactItem.update({
          where: { id: impactId },
          data: {
            status: "resolved",
            resolution: "accept",
            resolutionNote: note ?? null,
            resolvedPayload: impact.proposedChange,
          },
        });
      } else if (resolution === "keep_current") {
        await tx.impactItem.update({
          where: { id: impactId },
          data: {
            decision: "rejected",
            status: "resolved",
            resolution: "keep_current",
            resolutionNote: note ?? null,
          },
        });
      } else if (resolution === "reject") {
        await tx.impactItem.update({
          where: { id: impactId },
          data: {
            decision: "rejected",
            status: "resolved",
            resolution: "reject",
            resolutionNote: note ?? null,
          },
        });
      } else if (resolution === "edit_payload") {
        if (!payload) {
          throw new BadRequestException("Payload is required for edit_payload resolution.");
        }
        const currentChange = (impact.resolvedPayload ?? impact.proposedChange) as any;
        const updatedChange = {
          ...currentChange,
          data: payload,
        };
        await tx.impactItem.update({
          where: { id: impactId },
          data: {
            status: "resolved",
            resolution: "edit_payload",
            resolutionNote: note ?? null,
            resolvedPayload: updatedChange,
          },
        });
      } else if (resolution === "retarget") {
        if (!payload || typeof payload.entityId !== "string") {
          throw new BadRequestException("Target entityId is required for retarget resolution.");
        }
        const currentChange = (impact.resolvedPayload ?? impact.proposedChange) as any;
        const updatedChange = {
          ...currentChange,
          entityId: payload.entityId,
        };
        await tx.impactItem.update({
          where: { id: impactId },
          data: {
            entityId: payload.entityId,
            status: "resolved",
            resolution: "retarget",
            resolutionNote: note ?? null,
            resolvedPayload: updatedChange,
          },
        });
      } else if (resolution === "split") {
        await tx.impactItem.update({
          where: { id: impactId },
          data: {
            status: "resolved",
            resolution: "split",
            resolutionNote: note ?? null,
          },
        });
        const currentChange = (impact.resolvedPayload ?? impact.proposedChange) as any;
        const splitChange = {
          ...currentChange,
          operation: "create",
          entityId: null,
          expectedVersion: null,
        };
        await tx.impactItem.create({
          data: {
            evolveSessionId: id,
            entityType: impact.entityType,
            entityId: null,
            severity: impact.severity,
            title: `Split: ${impact.title} (Create)`,
            reasoning: `Split from impact ${impact.title}. ${note ?? ""}`,
            proposedChange: splitChange,
            decision: "pending",
            status: "ready",
          },
        });
      }
    });

    await this.validateSession(id, session.projectId);
    return this.get(id, userId);
  }

  async validateSession(id: string, projectId: string) {
    await this.prisma.client.$transaction(async (tx: any) => {
      const impacts = await tx.impactItem.findMany({
        where: { evolveSessionId: id },
      });
      for (const impact of impacts) {
        if (impact.decision === "rejected") {
          continue;
        }
        await tx.impactItem.update({
          where: { id: impact.id },
          data: { status: "ready", conflictReason: null, currentSnapshot: null },
        });
      }
    });

    await this.prisma.client.$transaction(async (tx: any) => {
      const activeImpacts = await tx.impactItem.findMany({
        where: { evolveSessionId: id },
      });

      const targetKeys = new Map<string, any[]>();

      for (const impact of activeImpacts) {
        if (impact.decision === "rejected") continue;

        const change = (impact.resolvedPayload ?? impact.proposedChange) as any;
        const op = change?.operation;
        const type = impact.entityType;
        const entityId = impact.entityId;

        const delegate = this.entityDelegate(tx, type);
        if (!delegate || !["create", "update", "delete"].includes(op)) {
          await tx.impactItem.update({
            where: { id: impact.id },
            data: { status: "blocked", conflictReason: `Unsupported entity type "${type}" or operation "${op}".` },
          });
          continue;
        }

        if (op !== "create") {
          if (!entityId) {
            await tx.impactItem.update({
              where: { id: impact.id },
              data: { status: "blocked", conflictReason: `Entity ID is required for operation "${op}".` },
            });
            continue;
          }

          const currentRecord = await delegate.findFirst({
            where: { id: entityId, projectId },
          });

          if (!currentRecord) {
            await tx.impactItem.update({
              where: { id: impact.id },
              data: { status: "blocked", conflictReason: `Target entity of type "${type}" with ID "${entityId}" not found.` },
            });
            continue;
          }

          await tx.impactItem.update({
            where: { id: impact.id },
            data: { currentSnapshot: currentRecord },
          });

          const expectedVersion = change.expectedVersion;
          if (expectedVersion !== undefined && expectedVersion !== null && currentRecord.version !== expectedVersion) {
            await tx.impactItem.update({
              where: { id: impact.id },
              data: {
                status: "conflict",
                conflictReason: `Stale expectedVersion: expected ${expectedVersion}, but database has ${currentRecord.version}.`
              },
            });
            continue;
          }

          const key = `${type.toLowerCase()}:${entityId}`;
          if (!targetKeys.has(key)) {
            targetKeys.set(key, []);
          }
          targetKeys.get(key)!.push(impact);
        }
      }

      for (const [key, items] of targetKeys.entries()) {
        if (items.length > 1) {
          for (const item of items) {
            await tx.impactItem.update({
              where: { id: item.id },
              data: {
                status: "conflict",
                conflictReason: `Duplicate/conflicting changes on the same entity (${key}) in this session.`,
              },
            });
          }
        }
      }
    });

    let linkageError: string | null = null;
    try {
      await this.prisma.client.$transaction(async (tx: any) => {
        const impacts = await tx.impactItem.findMany({
          where: { evolveSessionId: id },
        });

        for (const impact of impacts) {
          if (impact.decision === "rejected" || impact.status === "blocked") {
            continue;
          }
          try {
            await this.applyImpact(tx, projectId, impact);
          } catch (e: any) {
            // Dry run ignore nested errors
          }
        }

        await this.assertConnectedProductThread(tx, projectId);
        throw new DryRunRollback();
      });
    } catch (err) {
      if (!(err instanceof DryRunRollback)) {
        linkageError = err instanceof Error ? err.message : "Linkage check failed";
      }
    }

    if (linkageError) {
      await this.prisma.client.$transaction(async (tx: any) => {
        const impacts = await tx.impactItem.findMany({
          where: { evolveSessionId: id },
        });
        for (const impact of impacts) {
          if (impact.decision === "rejected" || impact.status === "blocked") {
            continue;
          }
          const change = (impact.resolvedPayload ?? impact.proposedChange) as any;
          const op = change?.operation;
          const isStrategicType = ["ambition", "okr", "persona", "painpoint", "userneed"].includes(impact.entityType.toLowerCase().replace(/[\s_-]/g, ""));
          if (isStrategicType && (op === "delete" || op === "update")) {
            await tx.impactItem.update({
              where: { id: impact.id },
              data: {
                status: "blocked",
                conflictReason: `Linkage-breaking change: would break the required Ambition-to-User-Need thread. Detail: ${linkageError}`,
              },
            });
          }
        }
      });
    }
  }

  private async applyImpact(tx: any, projectId: string, impact: any) {
    const change = (impact.resolvedPayload ?? impact.proposedChange) as Record<string, unknown>;
    const operation = String(change.operation ?? "update");
    const data = (change.data ?? change.fields ?? {}) as Record<string, unknown>;
    const entityId = String(change.entityId ?? impact.entityId ?? "");
    const expectedVersion = Number(change.expectedVersion ?? data.version ?? 0);
    const delegate = this.entityDelegate(tx, impact.entityType);

    if (!delegate) {
      throw new BadRequestException(
        `Unsupported Evolve entity type: ${impact.entityType}`,
      );
    }
    if (operation === "create") {
      const created = await delegate.create({
        data: { ...data, projectId },
        select: { id: true, version: true },
      });
      return { impactId: impact.id, operation, entityType: impact.entityType, ...created };
    }
    if (!entityId) {
      throw new BadRequestException("An entity ID is required for this change.");
    }
    const current = await delegate.findFirst({
      where: { id: entityId, projectId },
    });
    if (!current) {
      throw new BadRequestException("The affected product record no longer exists.");
    }
    if (expectedVersion && current.version !== expectedVersion) {
      versionConflict(current.version);
    }
    if (operation === "delete") {
      await delegate.delete({ where: { id: entityId } });
      return { impactId: impact.id, operation, entityType: impact.entityType, id: entityId };
    }
    const updated = await delegate.update({
      where: { id: entityId },
      data: {
        ...data,
        id: undefined,
        projectId: undefined,
        version: { increment: 1 },
      },
      select: { id: true, version: true },
    });
    return { impactId: impact.id, operation: "update", entityType: impact.entityType, ...updated };
  }

  private entityDelegate(tx: any, entityType: string) {
    const key = entityType.toLowerCase().replace(/[\s_-]/g, "");
    return {
      ambition: tx.ambition,
      okr: tx.okr,
      persona: tx.persona,
      painpoint: tx.painPoint,
      userneed: tx.userNeed,
      userstory: tx.userStory,
      task: tx.task,
    }[key];
  }

  private async assertConnectedProductThread(tx: any, projectId: string) {
    const connected = await tx.userNeed.findFirst({
      where: {
        projectId,
        persona: {
          okrLinks: {
            some: {
              okr: { ambition: { projectId } },
            },
          },
        },
      },
      select: { id: true },
    });
    const hasStrategicRecords = await tx.ambition.count({ where: { projectId } });
    if (hasStrategicRecords > 0 && !connected) {
      throw new BadRequestException(
        "Approved changes would break the required Ambition-to-User-Need thread.",
      );
    }
  }

  async saveAsDraft(projectId: string, sessionId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder"]);
    const session = await this.prisma.client.evolveSession.findFirstOrThrow({
      where: { id: sessionId, projectId, status: "active" },
    });
    return this.prisma.client.evolveSession.update({
      where: { id: session.id },
      data: { status: "draft" },
    });
  }

  async deleteSession(projectId: string, sessionId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder"]);
    const session = await this.prisma.client.evolveSession.findFirstOrThrow({
      where: { id: sessionId, projectId, status: { in: ["draft", "nav_away"] } },
    });
    await this.prisma.client.impactItem.deleteMany({ where: { evolveSessionId: session.id } });
    return this.prisma.client.evolveSession.delete({ where: { id: session.id } });
  }

  private async require(id: string, userId: string) {
    const session = await this.prisma.client.evolveSession.findUniqueOrThrow({
      where: { id },
    });
    await this.access.require(session.projectId, userId, ["founder"]);
    return session;
  }
}

class DryRunRollback extends Error {
  constructor() {
    super("Dry run rollback");
  }
}

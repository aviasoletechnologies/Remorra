import { BadRequestException, Injectable } from "@nestjs/common";
import { createRefineSessionSchema } from "@remorra/contracts";
import { CryptoService } from "../../infrastructure/crypto.service.js";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";
import { ViabilityService } from "../viability/viability.service.js";

@Injectable()
export class RefineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly access: ProjectAccessService,
    private readonly queue: QueueService,
    private readonly viability: ViabilityService,
  ) {}

  async create(userId: string, input: unknown) {
    const { projectId } = createRefineSessionSchema.parse(input);
    await this.access.require(projectId, userId, ["founder"]);
    return this.prisma.client.$transaction(async (tx: any) => {
      const conversation = await tx.conversation.create({
        data: {
          projectId,
          kind: "refine",
          retentionUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        },
      });
      return tx.refineSession.create({
        data: {
          projectId,
          conversationId: conversation.id,
          stage: "founder_pack_validation",
        },
      });
    });
  }

  async get(id: string, userId: string) {
    const session = await this.prisma.client.refineSession.findUniqueOrThrow({
      where: { id },
      include: { proposals: { orderBy: { createdAt: "asc" } } },
    });
    await this.access.require(session.projectId, userId, ["founder"]);
    const messages = session.conversationId
      ? await this.prisma.client.conversationMessage.findMany({
          where: { conversationId: session.conversationId },
          orderBy: { createdAt: "asc" },
        })
      : [];
    return {
      ...session,
      messages: messages.map((message: any) => ({
        id: message.id,
        role: message.role,
        content: this.crypto.decrypt(message.encryptedContent),
        createdAt: message.createdAt,
      })),
    };
  }

  async message(id: string, userId: string, content: string) {
    const session = await this.get(id, userId);
    if (!session.conversationId) {
      throw new BadRequestException("Refine conversation is unavailable.");
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
        skillId: "refine-prompter",
        refineSessionId: id,
        conversationId: session.conversationId,
        content,
      },
    });
  }

  async extract(id: string, userId: string) {
    const session = await this.get(id, userId);
    return this.queue.enqueue({
      queue: QUEUES.aiExtract,
      projectId: session.projectId,
      userId,
      idempotencyKey: `refine-extract:${id}`,
      payload: { skillId: "entity-extractor", refineSessionId: id },
    });
  }

  async proposals(id: string, userId: string) {
    const session = await this.get(id, userId);
    return session.proposals;
  }

  async decide(proposalId: string, userId: string, confirm: boolean) {
    const proposal = await this.prisma.client.refineProposal.findUniqueOrThrow({
      where: { id: proposalId },
    });
    await this.access.require(proposal.projectId, userId, ["founder"]);
    if (proposal.status !== "pending") {
      throw new BadRequestException("Proposal has already been decided.");
    }
    if (!confirm) {
      return this.prisma.client.refineProposal.update({
        where: { id: proposalId },
        data: { status: "rejected", decidedAt: new Date() },
      });
    }
    const result = await this.prisma.client.$transaction(async (tx: any) => {
      const payload = proposal.payload as Record<string, unknown>;
      switch (proposal.entityType) {
        case "ambition":
          await tx.ambition.create({
            data: {
              projectId: proposal.projectId,
              title: String(payload.title),
              detail: String(payload.detail),
            },
          });
          break;
        case "okr":
          await tx.okr.create({
            data: {
              projectId: proposal.projectId,
              ambitionId: String(payload.ambitionId),
              objective: String(payload.objective),
              keyResults: payload.keyResults ?? [],
            },
          });
          break;
        case "persona":
          await tx.persona.create({
            data: {
              projectId: proposal.projectId,
              name: String(payload.name),
              description: String(payload.description),
            },
          });
          break;
        case "pain_point":
          await tx.painPoint.create({
            data: {
              projectId: proposal.projectId,
              personaId: String(payload.personaId),
              statement: String(payload.statement),
            },
          });
          break;
        case "user_need":
          await tx.userNeed.create({
            data: {
              projectId: proposal.projectId,
              personaId: String(payload.personaId),
              statement: String(payload.statement),
            },
          });
          break;
        default:
          throw new BadRequestException("Unsupported proposal type.");
      }
      await tx.refineProposal.update({
        where: { id: proposalId },
        data: { status: "confirmed", decidedAt: new Date() },
      });
      return this.assembleProductPack(proposal.projectId, tx);
    });

    await this.viability.autoRecalculate(proposal.projectId, userId).catch((err) => {
      console.error("Failed to trigger autoRecalculate in RefineService", err);
    });

    return result;
  }

  async productPack(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    return this.assembleProductPack(projectId, this.prisma.client);
  }

  async linkage(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const data = await this.assembleProductPack(projectId, this.prisma.client);
    return { valid: data.linkageValid, coveragePercent: data.coveragePercent };
  }

  private async assembleProductPack(projectId: string, db: any) {
    const [ambitions, personas] = await Promise.all([
      db.ambition.findMany({
        where: { projectId },
        include: { okrs: { include: { personaLinks: true } } },
      }),
      db.persona.findMany({
        where: { projectId },
        include: { painPoints: true, userNeeds: true },
      }),
    ]);
    const completeThread = ambitions.some((ambition: any) =>
      ambition.okrs.some((okr: any) =>
        okr.personaLinks.some((link: any) => {
          const persona = personas.find((item: any) => item.id === link.personaId);
          return persona?.painPoints.length && persona.userNeeds.length;
        }),
      ),
    );
    const total = ambitions.length + personas.length;
    const covered =
      ambitions.filter((item: any) => item.okrs.length > 0).length +
      personas.filter(
        (item: any) => item.painPoints.length > 0 && item.userNeeds.length > 0,
      ).length;
    const coveragePercent = total ? Math.round((covered / total) * 100) : 0;
    const latest = await db.productPack.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
    });
    return db.productPack.create({
      data: {
        projectId,
        version: (latest?.version ?? 0) + 1,
        coveragePercent,
        linkageValid: Boolean(completeThread),
        content: { ambitions, personas },
      },
    });
  }
}

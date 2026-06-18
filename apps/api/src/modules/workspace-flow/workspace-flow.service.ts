import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";
import { IntentRouterService } from "./intent-router.service.js";

type WorkspaceActiveSkill = {
  id: string;
  name: string;
  description: string;
  version: number;
  versionId: string;
};

type WorkspaceMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};

type WorkspaceConversation = {
  id: string;
  status: string;
  activeSkill: WorkspaceActiveSkill | null;
  messages: WorkspaceMessage[];
};

@Injectable()
export class WorkspaceFlowService {
  private readonly logger = new Logger(WorkspaceFlowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly queue: QueueService,
    private readonly intentRouter: IntentRouterService,
  ) {}

  async getOrCreate(projectId: string, userId: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const conversation = await this.loadConversation(projectId) ?? await this.createConversation(projectId);
    return this.serialize(conversation);
  }

  async message(projectId: string, userId: string, rawContent: string) {
    await this.access.require(projectId, userId, ["founder", "team"]);
    const content = rawContent.trim();
    if (!content) throw new BadRequestException("Message content is required.");

    const conversation = await this.loadConversation(projectId) ?? await this.createConversation(projectId);
    this.logger.debug(
      `Incoming workspace message project=${projectId} conversation=${conversation.id} user=${userId} activeSkill=${conversation.activeSkill?.id ?? "none"} contentPreview=${content.slice(0, 120)}`,
    );
    await this.prisma.client.conversationMessage.create({
      data: {
        conversationId: conversation.id,
        actorId: userId,
        role: "user",
        content,
        skillId: conversation.activeSkill?.id ?? null,        // save whichever skill was pinned when user sent this
        skillVersionId: conversation.activeSkill?.versionId ?? null,
      },
    });

    const activeSkill = conversation.activeSkill;
    if (activeSkill?.id && activeSkill.versionId) {
      this.logger.debug(
        `Using pinned active skill project=${projectId} conversation=${conversation.id} skillId=${activeSkill.id} versionId=${activeSkill.versionId}`,
      );
      return this.enqueueConversationTurn({
        conversationId: conversation.id,
        projectId,
        userId,
        skillId: activeSkill.id,
        content,
      });
    }

    // No skill pinned → always use Intent Router (AI decides which skill fits)
    // Note: Event Router is only used for skill.{id}.completed chaining (in worker),
    // NOT for initial message routing — that would break when chaining mappings exist.
    this.logger.debug(`No active skill pinned. Using Intent Router. project=${projectId} conversation=${conversation.id}`);
    const intent = await this.intentRouter.routeMessage(projectId, userId, content);

    if (intent.routeType === "skill" && intent.skillId) {
      const version = await this.prisma.client.skillVersion.findFirstOrThrow({
        where: { skillId: intent.skillId, active: true },
        orderBy: { version: "desc" },
      });

      await this.prisma.client.conversation.update({
        where: { id: conversation.id },
        data: {
          activeSkillId:        intent.skillId,
          activeSkillVersionId: version.id,
          activeSkillPinnedAt:  new Date(),
        },
      });
      this.logger.log(
        `Pinned skill via Intent Router project=${projectId} conversation=${conversation.id} skillId=${intent.skillId} versionId=${version.id}`,
      );

      const job = await this.enqueueConversationTurn({
        conversationId: conversation.id,
        projectId,
        userId,
        skillId:        intent.skillId,
        skillVersionId: version.id,
        content,
      });
      return { id: job.id };
    }

    // Intent Router found no skill match → general chat
    this.logger.log(`General chat fallback via Intent Router project=${projectId} conversation=${conversation.id}`);
    const job = await this.enqueueConversationTurn({
      conversationId: conversation.id,
      projectId,
      userId,
      content,
      fallbackMode: "general_chat",
    });
    return { id: job.id };
  }

  async action(
    projectId: string,
    userId: string,
    body: { outputs?: Record<string, unknown>; note?: string },
  ) {
    await this.access.require(projectId, userId, ["founder"]);
    const note = body.note?.trim();
    if (!note) {
      throw new BadRequestException("Workspace actions now use message routing. Send a message instead.");
    }
    return this.message(projectId, userId, note);
  }

  private async enqueueConversationTurn(input: {
    conversationId: string;
    projectId: string;
    userId: string;
    content: string;
    skillId?: string;
    skillVersionId?: string;
    fallbackMode?: "general_chat";
  }) {
    return this.queue.enqueue({
      queue: QUEUES.aiConversation,
      projectId: input.projectId,
      userId: input.userId,
      payload: {
        conversationId: input.conversationId,
        ...(input.skillId ? { skillId: input.skillId } : {}),
        ...(input.skillVersionId ? { skillVersionId: input.skillVersionId } : {}),
        ...(input.fallbackMode ? { fallbackMode: input.fallbackMode } : {}),
        content: input.content,
      },
    });
  }

  private async loadConversation(projectId: string) {
    const conversation = await this.prisma.client.conversation.findFirst({
      where: { projectId, kind: "workspace", status: "active" },
      orderBy: { updatedAt: "desc" },
      include: {
        activeSkill: true,
        activeSkillVersion: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    return conversation ? this.normalizeConversation(conversation) : null;
  }

  private async createConversation(projectId: string) {
    const conversation = await this.prisma.client.conversation.create({
      data: {
        projectId,
        kind: "workspace",
        retentionUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
      include: {
        activeSkill: true,
        activeSkillVersion: true,
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    return this.normalizeConversation(conversation);
  }

  private normalizeConversation(conversation: any): WorkspaceConversation {
    return {
      id: conversation.id,
      status: conversation.status,
      activeSkill: conversation.activeSkillId && conversation.activeSkill
        ? {
            id: conversation.activeSkill.id,
            name: conversation.activeSkill.name,
            description: conversation.activeSkill.description,
            version: conversation.activeSkillVersion?.version ?? 0,
            versionId: conversation.activeSkillVersionId ?? conversation.activeSkillVersion?.id ?? "",
          }
        : null,
      messages: (conversation.messages ?? []).map((message: any) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt,
      })),
    };
  }

  private serialize(conversation: WorkspaceConversation) {
    return conversation;
  }
}

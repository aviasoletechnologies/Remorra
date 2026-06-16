import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { QueueService, QUEUES } from "../../infrastructure/queue.service.js";

@Injectable()
export class EventRouterService {
  private readonly logger = new Logger(EventRouterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  /**
   * Routes an application event to the appropriate AI Skill if a mapping exists in the database.
   */
  async route(input: {
    eventType: string;
    projectId: string;
    userId: string;
    payload?: Record<string, unknown>;
  }) {
    const { eventType, projectId, userId, payload = {} } = input;
    this.logger.log(`Routing event: ${eventType} for project: ${projectId}`);

    // Query active SkillEventMapping for this eventType
    const mapping = await this.prisma.client.skillEventMapping.findFirst({
      where: { eventType, active: true },
    });

    if (!mapping) {
      this.logger.debug(`No active event mapping found for event: ${eventType}`);
      return null;
    }

    this.logger.log(`Mapped event: ${eventType} to skill: ${mapping.skillId}`);

    // Determine target queue based on skill characteristics
    let queueName: (typeof QUEUES)[keyof typeof QUEUES] = QUEUES.aiConversation;

    if (mapping.skillId === "entity-extractor" || mapping.skillId === "linkage-contradiction-checker") {
      queueName = QUEUES.aiExtract;
    } else if (mapping.skillId === "viability-score-calculator") {
      queueName = QUEUES.aiExtract;
    } else if (mapping.skillId === "report-generator") {
      queueName = QUEUES.aiReport;
    }

    const job = await this.queue.enqueue({
      queue: queueName,
      projectId,
      userId,
      payload: {
        skillId: mapping.skillId,
        eventType,
        eventPayload: payload,
      },
    });

    return {
      skillId: mapping.skillId,
      jobId: job.id,
    };
  }
}

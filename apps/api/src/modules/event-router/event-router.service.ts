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
   * Routes an application event to the appropriate AI Skill(s) if mapping(s) exist in the database and pass conditions.
   */
  async route(input: {
    eventType: string;
    projectId: string;
    userId: string;
    payload?: Record<string, unknown>;
    idempotencyKey?: string;
  }) {
    const { eventType, projectId, userId, payload = {}, idempotencyKey } = input;
    this.logger.log(`Routing event: ${eventType} for project: ${projectId}`);

    // 1. Find ALL active mappings for this event type
    const mappings = await this.prisma.client.skillEventMapping.findMany({
      where: { eventType, active: true },
    });

    if (mappings.length === 0) {
      this.logger.debug(`No active event mapping found for event: ${eventType}`);
      return [];
    }

    // 2. Filter by conditions — commented out for now (trigger all active mappings)
    /*
    const matched = mappings.filter((mapping: any) => {
      const conditions = (mapping.conditions ?? {}) as Record<string, unknown>;
      return Object.entries(conditions).every(
        ([key, value]) => payload[key] === value
      );
    });

    if (matched.length === 0) {
      this.logger.debug(`Event ${eventType} matched ${mappings.length} mapping(s) but none passed conditions filter`);
      return [];
    }
    */
    const matched = mappings;

    // 3. Enqueue a job for EACH matched mapping
    const jobs = [];
    for (const mapping of matched) {
      this.logger.log(`Matched: ${eventType} → skill: ${mapping.skillId} on queue: ${mapping.targetQueue}`);
      const job = await this.queue.enqueue({
        queue: mapping.targetQueue as any,
        projectId,
        userId,
        idempotencyKey: matched.length === 1 ? idempotencyKey : (idempotencyKey ? `${idempotencyKey}:${mapping.skillId}` : undefined),
        payload: {
          skillId: mapping.skillId,
          eventType,
          ...payload,
        },
      });
      jobs.push({ skillId: mapping.skillId, jobId: job.id });
    }

    return jobs;
  }
}


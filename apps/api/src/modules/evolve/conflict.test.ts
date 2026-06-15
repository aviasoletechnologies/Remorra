import { describe, expect, it, vi, beforeEach } from "vitest";
import { EvolveService } from "./evolve.service.js";
import { JobsController } from "../jobs/jobs.controller.js";
import { JobsService } from "../jobs/jobs.service.js";
import { BadRequestException } from "@nestjs/common";

describe("Evolve Conflict & Streaming Tests", () => {
  let prismaMock: any;
  let evolveService: EvolveService;
  let jobsService: JobsService;
  let jobsController: JobsController;

  beforeEach(() => {
    prismaMock = {
      client: {
        $transaction: vi.fn(async (cb) => cb(prismaMock.client)),
        evolveSession: {
          findUniqueOrThrow: vi.fn(),
          update: vi.fn(),
        },
        impactItem: {
          findFirstOrThrow: vi.fn(),
          findMany: vi.fn(),
          update: vi.fn(),
          create: vi.fn(),
        },
        project: {
          findUniqueOrThrow: vi.fn(),
          update: vi.fn(),
        },
        jobRecord: {
          findFirstOrThrow: vi.fn(),
        },
        jobStreamEvent: {
          findMany: vi.fn(),
          createMany: vi.fn(),
        },
        ambition: {
          count: vi.fn().mockResolvedValue(0),
        },
        userNeed: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    };

    evolveService = new EvolveService(
      prismaMock as any,
      { encrypt: vi.fn((x) => x), decrypt: vi.fn((x) => x) } as any,
      { require: vi.fn().mockResolvedValue(true) } as any,
      { enqueue: vi.fn() } as any,
      { autoRecalculate: vi.fn().mockResolvedValue(undefined) } as any,
    );

    jobsService = new JobsService(prismaMock as any, {} as any);
    jobsController = new JobsController(jobsService);
  });

  describe("Phase 1: Token Streaming SSE & Reconnects", () => {
    it("returns stream events in sequence and filters by after query", async () => {
      const mockEvents = [
        { sequence: 1, type: "token", delta: "Hello", createdAt: new Date() },
        { sequence: 2, type: "token", delta: " world", createdAt: new Date() },
        { sequence: 3, type: "completed", snapshot: "Hello world", createdAt: new Date() },
      ];

      vi.spyOn(jobsService, "getStreamEvents").mockResolvedValue(mockEvents as any);

      const stream$ = jobsController.tokensStream(
        { userId: "user-1" } as any,
        "job-1",
        "0"
      );

      const events: any[] = [];
      await new Promise<void>((resolve, reject) => {
        const sub = stream$.subscribe({
          next: (e) => events.push(e.data),
          error: reject,
          complete: () => {
            sub.unsubscribe();
            resolve();
          },
        });
      });

      expect(events).toHaveLength(3);
      expect(events[0].sequence).toBe(1);
      expect(events[0].delta).toBe("Hello");
      expect(events[1].sequence).toBe(2);
      expect(events[1].delta).toBe(" world");
      expect(events[2].type).toBe("completed");
    });

    it("replays missed events after sequence when reconnecting", async () => {
      const mockMissedEvents = [
        { sequence: 3, type: "completed", snapshot: "Hello world", createdAt: new Date() },
      ];

      vi.spyOn(jobsService, "getStreamEvents").mockResolvedValue(mockMissedEvents as any);

      const stream$ = jobsController.tokensStream(
        { userId: "user-1" } as any,
        "job-1",
        "2"
      );

      const events: any[] = [];
      await new Promise<void>((resolve, reject) => {
        const sub = stream$.subscribe({
          next: (e) => events.push(e.data),
          error: reject,
          complete: () => {
            sub.unsubscribe();
            resolve();
          },
        });
      });

      expect(events).toHaveLength(1);
      expect(events[0].sequence).toBe(3);
      expect(events[0].type).toBe("completed");
    });
  });

  describe("Phase 2: Conflict Detection & Resolution", () => {
    it("detects stale versions and sets conflict status", async () => {
      const mockImpact = {
        id: "impact-1",
        entityType: "task",
        entityId: "task-123",
        proposedChange: { operation: "update", expectedVersion: 2, data: { title: "New Title" } },
        decision: "pending",
      };

      prismaMock.client.impactItem.findMany.mockResolvedValue([mockImpact]);

      prismaMock.client.task = {
        findFirst: vi.fn().mockResolvedValue({ id: "task-123", version: 3 }),
      };

      await evolveService.validateSession("session-1", "project-1");

      expect(prismaMock.client.impactItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "impact-1" },
          data: expect.objectContaining({
            status: "conflict",
            conflictReason: expect.stringContaining("Stale expectedVersion"),
          }),
        })
      );
    });

    it("detects missing target entity and sets blocked status", async () => {
      const mockImpact = {
        id: "impact-2",
        entityType: "task",
        entityId: "task-999",
        proposedChange: { operation: "update", expectedVersion: 1, data: { title: "Title" } },
        decision: "pending",
      };

      prismaMock.client.impactItem.findMany.mockResolvedValue([mockImpact]);

      prismaMock.client.task = {
        findFirst: vi.fn().mockResolvedValue(null),
      };

      await evolveService.validateSession("session-1", "project-1");

      expect(prismaMock.client.impactItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "impact-2" },
          data: expect.objectContaining({
            status: "blocked",
            conflictReason: expect.stringContaining("not found"),
          }),
        })
      );
    });

    it("resolving with edited payload permits committing", async () => {
      const mockImpact = {
        id: "impact-3",
        entityType: "task",
        entityId: "task-1",
        proposedChange: { operation: "update", expectedVersion: 1, data: { title: "Stale title" } },
        status: "conflict",
        decision: "approved",
      };

      prismaMock.client.evolveSession.findUniqueOrThrow.mockResolvedValue({
        id: "session-1",
        projectId: "project-1",
        baseProjectVersion: 1,
      });

      prismaMock.client.project.findUniqueOrThrow.mockResolvedValue({
        id: "project-1",
        version: 1,
      });

      prismaMock.client.impactItem.findFirstOrThrow.mockResolvedValue(mockImpact);
      prismaMock.client.impactItem.findMany.mockResolvedValue([mockImpact]);
      prismaMock.client.task = {
        findFirst: vi.fn().mockResolvedValue({ id: "task-1", version: 1 }),
      };

      await evolveService.resolve(
        "session-1",
        "impact-3",
        "edit_payload",
        "Resolved version mismatch",
        { title: "Resolved title" },
        "user-1"
      );

      expect(prismaMock.client.impactItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "impact-3" },
          data: expect.objectContaining({
            status: "resolved",
            resolution: "edit_payload",
            resolvedPayload: expect.objectContaining({
              data: { title: "Resolved title" },
            }),
          }),
        })
      );
    });

    it("prevents committing evolve session when conflicts are unresolved", async () => {
      prismaMock.client.evolveSession.findUniqueOrThrow.mockResolvedValue({
        id: "session-1",
        projectId: "project-1",
        baseProjectVersion: 1,
      });

      const mockConflictImpact = {
        id: "impact-4",
        decision: "approved",
        status: "conflict",
      };

      prismaMock.client.impactItem.findMany.mockResolvedValue([mockConflictImpact]);

      await expect(
        evolveService.complete("session-1", 1, "user-1")
      ).rejects.toThrow("Every conflict or block must be resolved before committing.");
    });
  });
});

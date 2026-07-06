import { describe, expect, it, vi, beforeEach } from "vitest";
import { handleRetention } from "./compliance";
import { prisma } from "../lib/prisma";

vi.mock("../config", () => ({
  config: {
    databaseUrl: "postgresql://mock",
    supabaseUrl: "https://mock.supabase.co",
    supabaseServiceRoleKey: "mock-key",
    supabasePrivateBucket: "mock-bucket",
  }
}));

vi.mock("../lib/prisma", () => {
  return {
    prisma: {
      retentionRun: {
        create: vi.fn(),
        update: vi.fn(),
      },
      retentionRunItem: {
        create: vi.fn(),
      },
      retentionPolicy: {
        findMany: vi.fn(),
      },
      conversation: {
        deleteMany: vi.fn(),
      },
      auditEvent: {
        deleteMany: vi.fn(),
      },
    },
  };
});

describe("Compliance Retention Worker Tests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("successfully cleans up conversations and audit events under active retention policies", async () => {
    // 1. Mock run creation and update
    vi.mocked(prisma.retentionRun.create).mockResolvedValue({ id: "run-123" } as any);
    vi.mocked(prisma.retentionRun.update).mockResolvedValue({ id: "run-123" } as any);

    // 2. Mock policies: both are enabled
    vi.mocked(prisma.retentionPolicy.findMany).mockResolvedValue([
      { id: "active-conversations", enabled: true, retentionDays: 90 },
      { id: "audit-records", enabled: true, retentionDays: 30 },
    ] as any);

    // 3. Mock delete counts
    vi.mocked(prisma.conversation.deleteMany).mockResolvedValue({ count: 5 } as any);
    vi.mocked(prisma.auditEvent.deleteMany).mockResolvedValue({ count: 42 } as any);

    const result = await handleRetention();

    // Verification
    expect(prisma.retentionRun.create).toHaveBeenCalled();
    expect(prisma.retentionPolicy.findMany).toHaveBeenCalledWith({ where: { enabled: true } });
    expect(prisma.conversation.deleteMany).toHaveBeenCalled();
    expect(prisma.auditEvent.deleteMany).toHaveBeenCalled();
    
    expect(prisma.retentionRunItem.create).toHaveBeenCalledWith({
      data: {
        retentionRunId: "run-123",
        policyId: "active-conversations",
        affectedCount: 5,
      },
    });
    expect(prisma.retentionRunItem.create).toHaveBeenCalledWith({
      data: {
        retentionRunId: "run-123",
        policyId: "audit-records",
        affectedCount: 42,
      },
    });

    expect(prisma.retentionRun.update).toHaveBeenCalledWith({
      where: { id: "run-123" },
      data: { status: "completed", completedAt: expect.any(Date) },
    });

    expect(result).toEqual({
      runId: "run-123",
      purged: {
        conversations: 5,
        auditEvents: 42,
      },
    });
  });

  it("does not delete conversations or audit events if the policies are disabled or not returned", async () => {
    vi.mocked(prisma.retentionRun.create).mockResolvedValue({ id: "run-456" } as any);
    vi.mocked(prisma.retentionPolicy.findMany).mockResolvedValue([]); // No enabled policies

    const result = await handleRetention();

    expect(prisma.conversation.deleteMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.deleteMany).not.toHaveBeenCalled();
    expect(prisma.retentionRunItem.create).not.toHaveBeenCalled();

    expect(prisma.retentionRun.update).toHaveBeenCalledWith({
      where: { id: "run-456" },
      data: { status: "completed", completedAt: expect.any(Date) },
    });

    expect(result).toEqual({
      runId: "run-456",
      purged: {
        conversations: 0,
        auditEvents: 0,
      },
    });
  });
});

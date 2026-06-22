import { vi, describe, expect, it } from "vitest";

// Mock config
vi.mock("../config", () => {
  return {
    config: {
      databaseUrl: "postgresql://mock",
      supabaseUrl: "https://mock",
      supabaseServiceRoleKey: "mock-key",
    },
    required: () => "mock-value",
  };
});

// Mock Prisma
vi.mock("../lib/prisma", () => {
  return {
    prisma: {
      reportGeneration: {
        create: vi.fn().mockResolvedValue({ id: "mock-report-gen-id" }),
      },
      generatedDocument: {
        create: vi.fn().mockResolvedValue({ id: "mock-doc-id" }),
      },
      jobRecord: {
        create: vi.fn().mockResolvedValue({ id: "mock-job-rec-id" }),
      },
    },
  };
});

// Mock pg-boss
vi.mock("../lib/boss", () => {
  return {
    boss: {
      send: vi.fn().mockResolvedValue("mock-job-id"),
    },
  };
});

import { prisma } from "../lib/prisma";
import { boss } from "../lib/boss";
import { triggerChatReportPdf } from "./pdf";

describe("PDF Service - triggerChatReportPdf", () => {
  it("creates a report, creates a generated document, creates a job record, and sends a pg-boss job", async () => {
    vi.mocked(prisma.reportGeneration.create).mockClear();
    vi.mocked(prisma.generatedDocument.create).mockClear();
    vi.mocked(prisma.jobRecord.create).mockClear();
    vi.mocked(boss.send).mockClear();

    const document = await triggerChatReportPdf(
      "project-123",
      "user-456",
      "conv-789",
      "This is report text content"
    );

    expect(prisma.reportGeneration.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-123",
        reportDefinitionId: "product-health",
        requestedById: "user-456",
        status: "completed",
        content: {
          create: {
            structuredContent: expect.anything(),
          },
        },
      },
    });

    expect(prisma.generatedDocument.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-123",
        reportGenerationId: "mock-report-gen-id",
        type: "chat-report",
        templateVersion: 1,
        status: "queued",
      },
    });

    expect(prisma.jobRecord.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-123",
        userId: "user-456",
        queue: "document.render",
        payload: expect.anything(),
      },
    });

    expect(boss.send).toHaveBeenCalledWith("document.render", {
      documentId: "mock-doc-id",
      documentType: "chat-report",
      projectId: "project-123",
      userId: "user-456",
    });

    expect(document).toEqual({ id: "mock-doc-id" });
  });
});

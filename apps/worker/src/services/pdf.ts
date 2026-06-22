import { prisma } from "../lib/prisma.js";
import { boss } from "../lib/boss.js";
import { jsonValue } from "../lib/utils.js";

export async function triggerChatReportPdf(
  projectId: string,
  userId: string,
  conversationId: string,
  text: string,
) {
  const reportGen = await prisma.reportGeneration.create({
    data: {
      projectId,
      reportDefinitionId: "product-health", // Using existing seeded reportDefinitionId to satisfy foreign key constraint
      requestedById: userId,
      status: "completed",
      content: {
        create: {
          structuredContent: jsonValue({ text }),
        },
      },
    },
  });

  const document = await prisma.generatedDocument.create({
    data: {
      projectId,
      reportGenerationId: reportGen.id,
      type: "chat-report",
      templateVersion: 1,
      status: "queued",
    },
  });

  await prisma.jobRecord.create({
    data: {
      projectId,
      userId,
      queue: "document.render",
      payload: jsonValue({
        documentId: document.id,
        documentType: "chat-report",
      }),
    },
  });

  await boss.send("document.render", {
    documentId: document.id,
    documentType: "chat-report",
    projectId,
    userId,
  });

  return document;
}

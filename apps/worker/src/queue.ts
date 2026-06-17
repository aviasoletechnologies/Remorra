import { type Job } from "pg-boss";
import { prisma } from "./lib/prisma";
import { boss } from "./lib/boss";
import { jsonValue } from "./lib/utils";
import { config } from "./config";
import {
  handleConversation,
  handleExtract,
  handleSummary,
  handleReport,
  handleDocument,
  handleGdprExport,
  handleGdprDelete,
  handleRetention,
  handleStorageExpiry,
  type Payload,
} from "./handlers";

export const queues = [
  "ai.conversation",
  "ai.extract",
  "ai.report",
  "ai.summary",
  "document.render",
  "gdpr.export",
  "gdpr.delete",
  "retention.cleanup",
  "storage.expire",
] as const;

export async function startQueue() {
  await prisma.$connect();
  await boss.start();
  for (const queue of queues) {
    await boss.createQueue(queue);
  }

  const enabled = config.enabledQueues;

  if (enabled.includes("ai.conversation")) {
    await boss.work<Payload>("ai.conversation", handleJobs(handleConversation));
  }
  if (enabled.includes("ai.extract")) {
    await boss.work<Payload>("ai.extract", handleJobs(handleExtract));
  }
  if (enabled.includes("ai.summary")) {
    await boss.work<Payload>("ai.summary", handleJobs(handleSummary));
  }
  if (enabled.includes("ai.report")) {
    await boss.work<Payload>("ai.report", handleJobs(handleReport));
  }
  if (enabled.includes("document.render")) {
    await boss.work<Payload>("document.render", handleJobs(handleDocument));
  }
  if (enabled.includes("gdpr.export")) {
    await boss.work<Payload>("gdpr.export", handleJobs(handleGdprExport));
  }
  if (enabled.includes("gdpr.delete")) {
    await boss.work<Payload>("gdpr.delete", handleJobs(handleGdprDelete));
  }
  if (enabled.includes("retention.cleanup")) {
    await boss.work<Payload>("retention.cleanup", handleJobs(handleRetention));
    await boss.schedule("retention.cleanup", "0 2 * * *", {});
  }
  if (enabled.includes("storage.expire")) {
    await boss.work<Payload>("storage.expire", handleJobs(handleStorageExpiry));
    await boss.schedule("storage.expire", "30 2 * * *", {});
  }

  console.info(
    JSON.stringify({
      service: "remorra-worker",
      event: "ready",
      enabledQueues: enabled,
    }),
  );
}

function handleJobs(handler: (payload: Payload) => Promise<unknown>) {
  return async (jobs: Job<Payload>[]) => {
    const results = [];
    for (const job of jobs) {
      results.push(await execute(job.data, handler));
    }
    return results;
  };
}

async function execute(payload: Payload, handler: (payload: Payload) => Promise<unknown>) {
  const record = await prisma.jobRecord.update({
    where: { id: payload.jobRecordId },
    data: { status: "running", attempts: { increment: 1 } },
  });
  const attempt = await prisma.jobAttempt.create({
    data: {
      jobRecordId: record.id,
      attempt: record.attempts,
      status: "running",
    },
  });
  try {
    const result = await handler(payload);
    await prisma.$transaction([
      prisma.jobRecord.update({
        where: { id: record.id },
        data: { status: "completed", result: jsonValue(result) },
      }),
      prisma.jobAttempt.update({
        where: { id: attempt.id },
        data: { status: "completed", finishedAt: new Date() },
      }),
    ]);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.$transaction([
      prisma.jobRecord.update({
        where: { id: record.id },
        data: { status: "failed", error: message },
      }),
      prisma.jobAttempt.update({
        where: { id: attempt.id },
        data: { status: "failed", error: message, finishedAt: new Date() },
      }),
    ]);
    throw error;
  }
}

import { type Job } from "pg-boss";
import { prisma } from "./lib/prisma";
import { boss } from "./lib/boss";
import { jsonValue } from "./lib/utils";
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

  await boss.work<Payload>("ai.conversation", handleJobs(handleConversation));
  await boss.work<Payload>("ai.extract", handleJobs(handleExtract));
  await boss.work<Payload>("ai.summary", handleJobs(handleSummary));
  await boss.work<Payload>("ai.report", handleJobs(handleReport));
  await boss.work<Payload>("document.render", handleJobs(handleDocument));
  await boss.work<Payload>("gdpr.export", handleJobs(handleGdprExport));
  await boss.work<Payload>("gdpr.delete", handleJobs(handleGdprDelete));
  await boss.work<Payload>("retention.cleanup", handleJobs(handleRetention));
  await boss.work<Payload>("storage.expire", handleJobs(handleStorageExpiry));

  await boss.schedule("retention.cleanup", "0 2 * * *", {});
  await boss.schedule("storage.expire", "30 2 * * *", {});
  console.info(JSON.stringify({ service: "remorra-worker", event: "ready" }));
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

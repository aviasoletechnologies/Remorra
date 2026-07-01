import { type Job } from "pg-boss";
import { prisma } from "./lib/prisma";
import { boss } from "./lib/boss";
import { jsonValue } from "./lib/utils";
import { config } from "./config";
import {
  handleConversation,
  handleReport,
  handleDocument,
  handleGdprExport,
  handleGdprDelete,
  handleRetention,
  handleStorageExpiry,
  handleBuildPackGenerate,
  handleBuildSyncIngest,
  handleBuildSyncExport,
  handleHealthScoreCalculate,
  type Payload,
} from "./handlers";

export const queues = [
  "ai.conversation",
  "ai.report",
  "document.render",
  "gdpr.export",
  "gdpr.delete",
  "retention.cleanup",
  "storage.expire",
  "build-pack.generate",
  "build-sync.ingest",
  "build-sync.export",
  "health-score.calculate",
] as const;

export async function startQueue() {
  await prisma.$connect();
  await boss.start();
  for (const queue of queues) {
    await boss.createQueue(queue);
  }

  const enabled = config.enabledQueues;

  if (enabled.includes("ai.conversation")) {
    await boss.work<Payload>("ai.conversation", handleJobs("ai.conversation", handleConversation));
  }
  if (enabled.includes("ai.report")) {
    await boss.work<Payload>("ai.report", handleJobs("ai.report", handleReport));
  }
  if (enabled.includes("document.render")) {
    await boss.work<Payload>("document.render", handleJobs("document.render", handleDocument));
  }
  if (enabled.includes("gdpr.export")) {
    await boss.work<Payload>("gdpr.export", handleJobs("gdpr.export", handleGdprExport));
  }
  if (enabled.includes("gdpr.delete")) {
    await boss.work<Payload>("gdpr.delete", handleJobs("gdpr.delete", handleGdprDelete));
  }
  if (enabled.includes("retention.cleanup")) {
    await boss.work<Payload>("retention.cleanup", handleJobs("retention.cleanup", handleRetention));
    await boss.schedule("retention.cleanup", "0 2 * * *", {});
  }
  if (enabled.includes("storage.expire")) {
    await boss.work<Payload>("storage.expire", handleJobs("storage.expire", handleStorageExpiry));
    await boss.schedule("storage.expire", "30 2 * * *", {});
  }
  if (enabled.includes("build-pack.generate")) {
    await boss.work<Payload>("build-pack.generate", handleJobs("build-pack.generate", handleBuildPackGenerate));
  }
  if (enabled.includes("build-sync.ingest")) {
    await boss.work<Payload>("build-sync.ingest", handleJobs("build-sync.ingest", handleBuildSyncIngest));
  }
  if (enabled.includes("build-sync.export")) {
    await boss.work<Payload>("build-sync.export", handleJobs("build-sync.export", handleBuildSyncExport));
  }
  if (enabled.includes("health-score.calculate")) {
    await boss.work<Payload>("health-score.calculate", handleJobs("health-score.calculate", handleHealthScoreCalculate));
  }

  console.info(
    JSON.stringify({
      service: "remorra-worker",
      event: "ready",
      enabledQueues: enabled,
    }),
  );
}

function handleJobs(queueName: string, handler: (payload: Payload) => Promise<unknown>) {
  return async (jobs: Job<Payload>[]) => {
    const results = [];
    for (const job of jobs) {
      results.push(await execute(queueName, job.data, handler));
    }
    return results;
  };
}

async function execute(
  queueName: string,
  payload: Payload,
  handler: (payload: Payload) => Promise<unknown>,
) {
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
    if (!config.enabledQueues.includes(queueName)) {
      throw new Error("Admin has disabled this feature");
    }
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

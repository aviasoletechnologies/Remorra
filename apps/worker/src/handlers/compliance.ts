import { prisma } from "../lib/prisma";
import { supabase, bucket } from "../lib/supabase";

export async function handleRetention() {
  const run = await prisma.retentionRun.create({ data: {} });
  try {
    const policies = await prisma.retentionPolicy.findMany({
      where: { enabled: true },
    });

    let conversationsDeleted = 0;
    let auditEventsDeleted = 0;

    for (const policy of policies) {
      if (policy.id === "active-conversations") {
        const conversationResult = await prisma.conversation.deleteMany({
          where: { retentionUntil: { lt: new Date() }, status: { not: "completed" } },
        });
        conversationsDeleted = conversationResult.count;
        await prisma.retentionRunItem.create({
          data: {
            retentionRunId: run.id,
            policyId: policy.id,
            affectedCount: conversationsDeleted,
          },
        });
      } else if (policy.id === "audit-records" && policy.retentionDays !== null) {
        const cutOff = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);
        const auditResult = await prisma.auditEvent.deleteMany({
          where: { createdAt: { lt: cutOff } },
        });
        auditEventsDeleted = auditResult.count;
        await prisma.retentionRunItem.create({
          data: {
            retentionRunId: run.id,
            policyId: policy.id,
            affectedCount: auditEventsDeleted,
          },
        });
      }
    }

    await prisma.retentionRun.update({
      where: { id: run.id },
      data: { status: "completed", completedAt: new Date() },
    });
    return {
      runId: run.id,
      purged: {
        conversations: conversationsDeleted,
        auditEvents: auditEventsDeleted,
      },
    };
  } catch (error) {
    await prisma.retentionRun.update({
      where: { id: run.id },
      data: { status: "failed", completedAt: new Date() },
    });
    throw error;
  }
}

export async function handleStorageExpiry() {
  const objects = await prisma.storageObject.findMany({
    where: { expiresAt: { lt: new Date() } },
    take: 500,
  });
  if (objects.length) {
    await supabase.storage.from(bucket).remove(objects.map((item: any) => item.path));
    await prisma.storageObject.deleteMany({
      where: { id: { in: objects.map((item: any) => item.id) } },
    });
  }
  return { removed: objects.length };
}

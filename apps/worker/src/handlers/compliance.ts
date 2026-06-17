import { prisma } from "../lib/prisma";
import { supabase, bucket } from "../lib/supabase";

export async function handleRetention() {
  const run = await prisma.retentionRun.create({ data: {} });
  try {
    const conversationResult = await prisma.conversation.deleteMany({
      where: { retentionUntil: { lt: new Date() }, status: { not: "completed" } },
    });
    await prisma.retentionRunItem.create({
      data: {
        retentionRunId: run.id,
        policyId: "active-conversations",
        affectedCount: conversationResult.count,
      },
    });
    await prisma.retentionRun.update({
      where: { id: run.id },
      data: { status: "completed", completedAt: new Date() },
    });
    return { runId: run.id };
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

import { prisma } from "../lib/prisma";
import { supabase, bucket } from "../lib/supabase";
import { encrypt, decrypt } from "../lib/crypto";
import type { Payload } from "./conversation";

export async function handleGdprExport(payload: Payload) {
  const userId = String(payload.userId);
  const exportId = String(payload.exportId);
  const profile = await prisma.profile.findUniqueOrThrow({
    where: { id: userId },
    include: {
      memberships: true,
      consents: true,
      deletionRequests: true,
      dataExports: true,
      tokenUsage: true,
      auditEvents: true,
    },
  });
  const ownedProjects = await prisma.project.findMany({
    where: { ownerId: userId },
    select: { id: true },
  });
  const projectIds = Array.from(
    new Set([
      ...ownedProjects.map((project: any) => project.id),
      ...profile.memberships.map((membership: any) => membership.projectId),
    ]),
  );
  const where = { projectId: { in: projectIds } };
  const [
    projects,
    ambitions,
    okrs,
    personas,
    painPoints,
    userNeeds,
    stories,
    tasks,
    conversations,
    cycles,
    raidItems,
    financeCategories,
    financeEntries,
    meetings,
    retrospectives,
    reports,
    documents,
    jobs,
  ] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: projectIds } } }),
    prisma.ambition.findMany({ where }),
    prisma.okr.findMany({ where }),
    prisma.persona.findMany({ where }),
    prisma.painPoint.findMany({ where }),
    prisma.userNeed.findMany({ where }),
    prisma.userStory.findMany({ where }),
    prisma.task.findMany({ where }),
    prisma.conversation.findMany({
      where,
      include: { messages: { orderBy: { createdAt: "asc" } }, extracts: true },
    }),
    prisma.cycle.findMany({ where }),
    prisma.raidItem.findMany({ where }),
    prisma.financeCategory.findMany({ where }),
    prisma.financeEntry.findMany({ where }),
    prisma.dailyMeeting.findMany({ where, include: { participants: true } }),
    prisma.retrospective.findMany({ where }),
    prisma.reportGeneration.findMany({
      where,
      include: { sourceSnapshot: true, content: true, document: true },
    }),
    prisma.generatedDocument.findMany({ where }),
    prisma.jobRecord.findMany({
      where: { OR: [{ userId }, { projectId: { in: projectIds } }] },
      include: { attemptsLog: true },
    }),
  ]);
  const archive = {
    exportedAt: new Date().toISOString(),
    profile,
    projects,
    product: {
      ambitions,
      okrs,
      personas,
      painPoints,
      userNeeds,
      stories,
      tasks,
      founderPacks: [],
      productPacks: [],
      refineSessions: [],
      evolveSessions: [],
      viability: [],
    },
    delivery: {
      cycles,
      raidItems,
      financeCategories,
      financeEntries,
      meetings,
      retrospectives,
    },
    conversations: conversations.map((conversation: any) => ({
      ...conversation,
      messages: conversation.messages.map((message: any) => ({
        ...message,
        encryptedContent: undefined,
        content: decrypt(message.encryptedContent),
      })),
    })),
    reports,
    documents,
    jobs,
  };
  const encrypted = Buffer.from(encrypt(JSON.stringify(archive, null, 2)));
  const path = `gdpr/${userId}/${exportId}.json.enc`;
  const { error } = await supabase.storage.from(bucket).upload(path, encrypted, {
    contentType: "application/octet-stream",
    upsert: true,
  });
  if (error) throw error;
  const storageObject = await prisma.storageObject.create({
    data: {
      bucket,
      path,
      mimeType: "application/octet-stream",
      sizeBytes: encrypted.byteLength,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.dataExport.update({
    where: { id: exportId },
    data: {
      status: "completed",
      completedAt: new Date(),
      expiresAt: storageObject.expiresAt,
      storageObjectId: storageObject.id,
    },
  });
  return { exportId };
}

export async function handleGdprDelete(payload: Payload) {
  const requestId = String(payload.deletionRequestId);
  const request = await prisma.deletionRequest.findUniqueOrThrow({
    where: { id: requestId },
  });
  if (request.status !== "scheduled") return { skipped: true };
  if (request.executeAt > new Date()) {
    throw new Error("Deletion grace period has not elapsed.");
  }
  const projects = await prisma.project.findMany({
    where: { ownerId: request.userId },
    select: { id: true },
  });
  const objects = await prisma.storageObject.findMany({
    where: {
      projectId: { in: projects.map((project: any) => project.id) },
    },
  });
  if (objects.length) {
    await supabase.storage.from(bucket).remove(objects.map((item: any) => item.path));
  }
  await prisma.$transaction(async (tx: any) => {
    await tx.project.deleteMany({ where: { ownerId: request.userId } });
    await tx.projectMembership.deleteMany({ where: { userId: request.userId } });
    await tx.conversationMessage.updateMany({
      where: { actorId: request.userId },
      data: { actorId: null, encryptedContent: encrypt("[deleted]") },
    });
    await tx.profile.update({
      where: { id: request.userId },
      data: {
        email: `deleted-${request.userId}@invalid`,
        preferredName: null,
        status: "deleted",
        deletedAt: new Date(),
      },
    });
    await tx.deletionRequest.update({
      where: { id: requestId },
      data: { status: "completed", completedAt: new Date() },
    });
  });
  await supabase.auth.admin.deleteUser(request.userId);
  return { deleted: true };
}

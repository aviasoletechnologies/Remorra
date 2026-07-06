import { prisma } from "../lib/prisma";
import { supabase, bucket } from "../lib/supabase";
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
    goals,
    epics,
    stories,
    personas,
    painPoints,
    raidItems,
    conversations,
    reports,
    documents,
    jobs,
  ] = await Promise.all([
    prisma.project.findMany({ where: { id: { in: projectIds } } }),
    prisma.goal.findMany({ where }),
    prisma.epic.findMany({ where }),
    prisma.story.findMany({ where }),
    prisma.persona.findMany({ where }),
    prisma.painPoint.findMany({ where }),
    prisma.raidItem.findMany({ where }),
    prisma.conversation.findMany({
      where,
      include: { messages: { orderBy: { createdAt: "asc" } }, extracts: true },
    }),
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
      goals,
      epics,
      stories,
      personas,
      painPoints,
    },
    delivery: {
      raidItems,
    },
    conversations: conversations.map((conversation: any) => ({
      ...conversation,
      messages: conversation.messages.map((message: any) => ({
        ...message,
        content: message.content,
      })),
    })),
    reports,
    documents,
    jobs,
  };
  const plainData = Buffer.from(JSON.stringify(archive, null, 2));
  const path = `gdpr/${userId}/${exportId}.json`;
  const { error } = await supabase.storage.from(bucket).upload(path, plainData, {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw error;
  const storageObject = await prisma.storageObject.create({
    data: {
      bucket,
      path,
      mimeType: "application/json",
      sizeBytes: plainData.byteLength,
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
    await tx.$executeRawUnsafe(`SELECT public.wipe_user($1::uuid)`, request.userId);
    await tx.deletionRequest.update({
      where: { id: requestId },
      data: { status: "completed", completedAt: new Date() },
    });
  });
  await supabase.auth.admin.deleteUser(request.userId);
  return { deleted: true };
}

import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { createClient } from "@supabase/supabase-js";
import {
  consentInputSchema,
  invitationInputSchema,
} from "@remorra/contracts";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ProjectAccessService } from "../../infrastructure/project-access.service.js";
import { ContextAutomationService } from "../../shared/context-automation.service.js";

@Injectable()
export class AuthService {
  private readonly supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ProjectAccessService,
    private readonly contextAutomation: ContextAutomationService,
  ) {}

  me(userId: string) {
    return this.prisma.client.profile.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        preferredName: true,
        platformRole: true,
        status: true,
        privacyPolicyVersion: true,
        termsVersion: true,
      },
    });
  }

  async consent(userId: string, input: unknown) {
    const data = consentInputSchema.parse(input);
    return this.prisma.client.$transaction(async (tx: any) => {
      await tx.consentRecord.create({ data: { userId, ...data } });
      return tx.profile.update({
        where: { id: userId },
        data: { ...data, consentedAt: new Date() },
      });
    });
  }

  async invite(projectId: string, actorId: string, input: unknown) {
    await this.access.require(projectId, actorId, ["founder"]);
    const data = invitationInputSchema.parse(input);
    const token = randomBytes(32).toString("base64url");
    const invitation = await this.prisma.client.invitation.create({
      data: {
        projectId,
        email: data.email.toLowerCase(),
        role: data.role,
        tokenHash: this.hash(token),
        invitedById: actorId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    const { error } = await this.supabase.auth.admin.inviteUserByEmail(data.email, {
      redirectTo: `${process.env.WEB_ORIGIN}/invitations/accept?token=${encodeURIComponent(token)}`,
      data: { invitation_id: invitation.id, project_id: projectId },
    });
    if (error) {
      await this.prisma.client.invitation.delete({ where: { id: invitation.id } });
      throw new BadRequestException(error.message);
    }
    return { id: invitation.id, expiresAt: invitation.expiresAt };
  }

  async accept(userId: string, email: string, token: string) {
    const invitation = await this.prisma.client.invitation.findUnique({
      where: { tokenHash: this.hash(token) },
    });
    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.expiresAt < new Date() ||
      invitation.email !== email.toLowerCase()
    ) {
      throw new BadRequestException("Invitation is invalid or expired.");
    }
    const result = await this.prisma.client.$transaction(async (tx: any) => {
      await tx.projectMembership.upsert({
        where: {
          projectId_userId: { projectId: invitation.projectId, userId },
        },
        create: {
          projectId: invitation.projectId,
          userId,
          role: invitation.role,
        },
        update: { role: invitation.role },
      });
      return tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date(), acceptedById: userId },
      });
    });

    const profile = await this.prisma.client.profile.findUnique({ where: { id: userId } });
    await this.contextAutomation
      .runRosterCapture(invitation.projectId, profile?.preferredName ?? email, invitation.role)
      .catch(() => undefined);

    return result;
  }

  async listMembers(projectId: string, actorId: string) {
    await this.access.require(projectId, actorId, ["founder", "team"]);
    return this.prisma.client.projectMembership.findMany({
      where: { projectId },
      select: {
        userId: true,
        role: true,
        createdAt: true,
        user: { select: { email: true, preferredName: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  async removeMember(projectId: string, actorId: string, targetUserId: string) {
    await this.access.require(projectId, actorId, ["founder"]);
    // Cannot remove yourself
    if (actorId === targetUserId) {
      throw new BadRequestException("You cannot remove yourself from the project.");
    }
    const deleted = await this.prisma.client.projectMembership.deleteMany({
      where: { projectId, userId: targetUserId, role: "team" },
    });
    if (deleted.count === 0) {
      throw new BadRequestException("Member not found in this project.");
    }
    return { removed: true };
  }

  private hash(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }
}

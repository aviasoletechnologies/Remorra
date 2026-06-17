import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { PrismaService } from "./prisma.service.js";
import { IS_PUBLIC } from "./public.decorator.js";

export interface AuthenticatedRequest {
  headers: Record<string, string | undefined>;
  auth?: {
    userId: string;
    email: string;
    platformRole: "user" | "admin" | "support";
    status: "active" | "deletion_pending" | "deleted";
  };
}

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(SupabaseAuthGuard.name);
  private readonly issuer = process.env.SUPABASE_JWT_ISSUER;
  private readonly audience = process.env.SUPABASE_JWT_AUDIENCE ?? "authenticated";
  private readonly supabase: SupabaseClient | null;
  private readonly jwks = this.issuer
    ? createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`))
    : undefined;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {
    const url = process.env.SUPABASE_URL;
    const key =
      process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabase =
      url && key
        ? createClient(url, key, {
            auth: { persistSession: false, autoRefreshToken: false },
          })
        : null;
  }

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    if ((!this.issuer || !this.jwks) && !this.supabase) {
      throw new UnauthorizedException("Supabase authentication is not configured.");
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;
    if (!token) throw new UnauthorizedException("Bearer token is required.");

    let identity;
    try {
      identity = await this.verifyIdentity(token);
    } catch {
      throw new UnauthorizedException("The access token is invalid or expired.");
    }
    const profile = await this.resolveProfile(identity.userId, identity.email);
    if (profile.status === "deleted") {
      throw new UnauthorizedException("This account has been deleted.");
    }
    request.auth = {
      userId: profile.id,
      email: profile.email,
      platformRole: profile.platformRole,
      status: profile.status,
    };
    return true;
  }

  private async resolveProfile(userId: string, email: string) {
    const profileById = await this.prisma.client.profile.findUnique({
      where: { id: userId },
    });
    if (profileById) {
      if (profileById.email === email) {
        return profileById;
      }

      try {
        return await this.prisma.client.profile.update({
          where: { id: profileById.id },
          data: { email },
        });
      } catch (error: any) {
        if (this.isEmailConflict(error)) {
          const profileByEmail = await this.prisma.client.profile.findUnique({
            where: { email },
          });
          if (profileByEmail) {
            this.logger.warn(
              `Profile email conflict during auth userId=${userId} email=${email}; using existing profile id=${profileByEmail.id}`,
            );
            return profileByEmail;
          }
        }
        throw error;
      }
    }

    const profileByEmail = await this.prisma.client.profile.findUnique({
      where: { email },
    });
    if (profileByEmail) {
      if (profileByEmail.id !== userId) {
        this.logger.warn(
          `Auth resolved by email instead of userId userId=${userId} email=${email} profileId=${profileByEmail.id}`,
        );
      }
      return profileByEmail;
    }

    try {
      return await this.prisma.client.profile.create({
        data: { id: userId, email },
      });
    } catch (error: any) {
      if (this.isUniqueConflict(error, "id")) {
        const retryProfileById = await this.prisma.client.profile.findUnique({
          where: { id: userId },
        });
        if (retryProfileById) {
          if (retryProfileById.email === email) {
            this.logger.warn(
              `Profile create raced on id conflict userId=${userId} email=${email}; using existing profile id=${retryProfileById.id}`,
            );
            return retryProfileById;
          }

          try {
            return await this.prisma.client.profile.update({
              where: { id: retryProfileById.id },
              data: { email },
            });
          } catch (updateError: any) {
            if (this.isUniqueConflict(updateError, "email")) {
              const retryProfileByEmail = await this.prisma.client.profile.findUnique({
                where: { email },
              });
              if (retryProfileByEmail) {
                this.logger.warn(
                  `Profile id conflict resolved by email userId=${userId} email=${email}; using existing profile id=${retryProfileByEmail.id}`,
                );
                return retryProfileByEmail;
              }
            }
            throw updateError;
          }
        }
      }

      if (this.isEmailConflict(error)) {
        const retryProfile = await this.prisma.client.profile.findUnique({
          where: { email },
        });
        if (retryProfile) {
          this.logger.warn(
            `Profile create raced on email conflict userId=${userId} email=${email}; using existing profile id=${retryProfile.id}`,
          );
          return retryProfile;
        }
      }
      throw error;
    }
  }

  private isEmailConflict(error: any) {
    return this.isUniqueConflict(error, "email");
  }

  private isUniqueConflict(error: any, field: string) {
    return error?.code === "P2002" && String(error?.message ?? "").includes(field);
  }

  private async verifyIdentity(token: string) {
    if (this.issuer && this.jwks) {
      try {
        const { payload } = await jwtVerify(token, this.jwks, {
          issuer: this.issuer,
          audience: this.audience,
        });
        if (!payload.sub) throw new Error("Missing subject");
        return {
          userId: payload.sub,
          email:
            typeof payload.email === "string"
              ? payload.email
              : "unknown@invalid",
        };
      } catch {
        // Legacy Supabase HS256 tokens are not exposed through the JWKS endpoint.
      }
    }
    if (!this.supabase) throw new Error("Supabase token verifier unavailable");
    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) throw error ?? new Error("Supabase user missing");
    return {
      userId: data.user.id,
      email: data.user.email ?? "unknown@invalid",
    };
  }
}

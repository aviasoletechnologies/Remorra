import {
  CanActivate,
  ExecutionContext,
  Injectable,
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
    const profile = await this.prisma.client.profile.upsert({
      where: { id: identity.userId },
      create: { id: identity.userId, email: identity.email },
      update: { email: identity.email },
    });
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

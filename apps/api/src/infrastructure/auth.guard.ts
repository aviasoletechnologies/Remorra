import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { createRemoteJWKSet, jwtVerify } from "jose";
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
  private readonly jwks = this.issuer
    ? createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`))
    : undefined;

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    if (!this.issuer || !this.jwks) {
      throw new UnauthorizedException("Supabase JWT issuer is not configured.");
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith("Bearer ")
      ? authorization.slice(7)
      : undefined;
    if (!token) throw new UnauthorizedException("Bearer token is required.");

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      });
      if (!payload.sub) throw new Error("Missing subject");
      const email =
        typeof payload.email === "string" ? payload.email : "unknown@invalid";
      const profile = await this.prisma.client.profile.upsert({
        where: { id: payload.sub },
        create: { id: payload.sub, email },
        update: { email },
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
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("The access token is invalid or expired.");
    }
  }
}

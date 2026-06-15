import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface Actor {
  userId: string;
  email: string;
  platformRole: "user" | "admin" | "support";
  status: "active" | "deletion_pending" | "deleted";
}

export const CurrentActor = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Actor => {
    const request = context.switchToHttp().getRequest<{ auth?: Actor }>();
    if (!request.auth) throw new Error("Authenticated actor is unavailable.");
    return request.auth;
  },
);

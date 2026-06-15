import { Injectable, NestMiddleware } from "@nestjs/common";

function stripHtml(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, "")
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
      .replace(/<\/?(?:script|iframe|object|embed|form|input|button)[^>]*>/gi, "");
  }
  if (Array.isArray(value)) return value.map(stripHtml);
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = stripHtml(v);
    }
    return result;
  }
  return value;
}

@Injectable()
export class SanitizeMiddleware implements NestMiddleware {
  use(req: any, _res: any, next: () => void) {
    if (req.body && typeof req.body === "object") {
      req.body = stripHtml(req.body);
    }
    next();
  }
}

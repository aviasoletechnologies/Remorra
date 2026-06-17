import { prisma } from "./prisma";

export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: { limit: number; backoff: boolean },
  context: { userId: string; projectId: string; skillVersionId?: string; model: string },
): Promise<T> {
  const maxAttempts = policy.limit ?? 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error?.status ?? error?.statusCode;
      const retryable = [429, 500, 529].includes(status) ||
        error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT";
      if (!retryable || attempt === maxAttempts - 1) {
        // Log to AiFailure on final failure
        if (context.skillVersionId) {
          await prisma.aiFailure.create({
            data: {
              userId: context.userId,
              projectId: context.projectId,
              skillVersionId: context.skillVersionId,
              model: context.model,
              error: error instanceof Error ? error.message : String(error),
              requestPayload: {},
            },
          }).catch(() => {}); // Don't let logging failure mask the original error
        }
        throw error;
      }
      if (policy.backoff) {
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }
  throw new Error("Retry exhausted");
}

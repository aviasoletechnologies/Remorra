import { afterEach, describe, expect, it, vi } from "vitest";
import { IntentRouterService } from "./intent-router.service.js";

describe("IntentRouterService", () => {
  const previousProvider = process.env.LLM_PROVIDER;
  const previousAnthropicKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    process.env.LLM_PROVIDER = previousProvider;
    process.env.ANTHROPIC_API_KEY = previousAnthropicKey;
    vi.restoreAllMocks();
  });

  it("falls back to general chat when Anthropic routing is unavailable", async () => {
    process.env.LLM_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "invalid-test-key";

    const prisma = {
      client: {
        project: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({ phase: "discover" }),
        },
        skill: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: "brain-dump-facilitator",
              name: "Brain Dump Facilitator",
              description: "Capture a product idea.",
              versions: [{ id: "version-1", version: 1, active: true }],
            },
          ]),
        },
      },
    };

    const service = new IntentRouterService(prisma as any);
    (service as any).client = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error("401 Unauthorized")),
      },
    };

    await expect(
      service.routeMessage("project-1", "user-1", "I want to build an inventory app"),
    ).resolves.toEqual({
      routeType: "general",
      skillId: null,
      confidence: 0,
      reason: "Intent router provider was unavailable.",
    });
  });
});

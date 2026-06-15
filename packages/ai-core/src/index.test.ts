import { describe, expect, it } from "vitest";
import type {
  AiInvocation,
  AiResult,
  LlmGateway,
  SkillDefinition,
} from "./index";

class FakeLlmGateway implements LlmGateway {
  async invoke<T>(invocation: AiInvocation): Promise<AiResult<T>> {
    return {
      value: { requestId: invocation.requestId } as T,
      usage: { model: "fake-local", inputTokens: 12, outputTokens: 8 },
      skillVersion: invocation.skill.version,
    };
  }

  async *stream() {
    yield "test";
  }
}

describe("FakeLlmGateway", () => {
  it("returns deterministic usage metadata", async () => {
    const skill: SkillDefinition = {
      id: "brain-dump",
      name: "Brain Dump Facilitator",
      version: 1,
      modelTier: "standard",
      systemPrompt: "Guide the founder.",
      contextRequirements: [],
      constraints: [],
    };
    const gateway = new FakeLlmGateway();
    const result = await gateway.invoke({
      requestId: "request-1",
      userId: "user-1",
      projectId: "project-1",
      skill,
      sections: [],
    });
    expect(result.usage.model).toBe("fake-local");
    expect(result.skillVersion).toBe(1);
  });
});

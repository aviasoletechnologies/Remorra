import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

@Injectable()
export class AnthropicService {
  private readonly client: Anthropic;

  constructor(private readonly prisma: PrismaService) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");
    this.client = new Anthropic({
      apiKey,
      baseURL: process.env.ANTHROPIC_BASE_URL,
    });
  }

  async invoke(input: {
    skillId: string;
    userId: string;
    projectId: string;
    content: string;
    context?: string;
  }) {
    const skill = await this.prisma.client.skillVersion.findFirstOrThrow({
      where: { skillId: input.skillId, active: true },
    });
    const model = this.resolveModel(skill.modelTier);
    const requestId = randomUUID();
    const invocation = await this.prisma.client.aiInvocation.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        skillVersionId: skill.id,
        requestId,
        model,
        status: "running",
      },
    });
    const started = Date.now();
    try {
      const response = await this.client.messages.create({
        model,
        max_tokens: skill.tokenCeiling,
        system: skill.systemPrompt,
        messages: [
          ...(input.context
            ? [
                {
                  role: "user" as const,
                  content: `<application_context>${input.context}</application_context>`,
                },
              ]
            : []),
          {
            role: "user",
            content: `<user_message>${input.content}</user_message>`,
          },
        ],
      });
      const text = response.content
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n");
      await this.prisma.client.$transaction([
        this.prisma.client.aiInvocation.update({
          where: { id: invocation.id },
          data: {
            status: "completed",
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            latencyMs: Date.now() - started,
            completedAt: new Date(),
          },
        }),
        this.prisma.client.tokenUsage.create({
          data: {
            userId: input.userId,
            projectId: input.projectId,
            skillVersionId: skill.id,
            requestId,
            model,
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            costMinor: 0,
          },
        }),
      ]);
      return { text, skillVersion: skill.version, requestId };
    } catch (error) {
      await this.prisma.client.aiInvocation.update({
        where: { id: invocation.id },
        data: { status: "failed", completedAt: new Date() },
      });
      await this.prisma.client.aiFailure.create({
        data: {
          aiInvocationId: invocation.id,
          code: "anthropic_error",
          message: error instanceof Error ? error.message : "Unknown error",
          retryable: true,
        },
      });
      throw error;
    }
  }

  private resolveModel(tier: string) {
    const models: Record<string, string | undefined> = {
      fast: process.env.ANTHROPIC_MODEL_FAST,
      standard: process.env.ANTHROPIC_MODEL_STANDARD,
      reasoning: process.env.ANTHROPIC_MODEL_REASONING,
    };
    const model = models[tier];
    if (!model) throw new Error(`Anthropic model tier ${tier} is not configured.`);
    return model;
  }
}

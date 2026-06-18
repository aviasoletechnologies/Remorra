import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";

function grokModelFor(tier: string) {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.GROQ_API_KEY;
  const isGroq = !!process.env.GROQ_API_KEY || (typeof apiKey === "string" && apiKey.startsWith("gsk_"));
  const defaultModel = isGroq ? "llama-3.3-70b-versatile" : "grok-2-1212";

  if (tier === "fast") return process.env.GROK_MODEL_FAST || process.env.GROQ_MODEL_FAST || defaultModel;
  if (tier === "reasoning") return process.env.GROK_MODEL_REASONING || process.env.GROQ_MODEL_REASONING || defaultModel;
  return process.env.GROK_MODEL_STANDARD || process.env.GROQ_MODEL_STANDARD || defaultModel;
}

async function invokeGrok(input: {
  model: string;
  max_tokens?: number;
  system?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
}) {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.GROQ_API_KEY;
  const isGroq = !!process.env.GROQ_API_KEY || (typeof apiKey === "string" && apiKey.startsWith("gsk_"));
  const defaultBaseUrl = isGroq ? "https://api.groq.com/openai/v1" : "https://api.x.ai/v1";
  const baseUrl = process.env.GROK_BASE_URL || process.env.GROQ_BASE_URL || defaultBaseUrl;

  const payload = {
    model: input.model,
    max_tokens: input.max_tokens,
    temperature: input.temperature ?? 0,
    messages: [
      ...(input.system ? [{ role: "system", content: input.system }] : []),
      ...input.messages.map(m => ({ role: m.role, content: m.content })),
    ],
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Grok API error (${res.status}): ${errorText}`);
  }

  const data = await res.json() as any;
  const text = data.choices[0]?.message?.content || "";
  const promptTokens = data.usage?.prompt_tokens ?? 0;
  const completionTokens = data.usage?.completion_tokens ?? 0;

  return {
    content: [{ type: "text", text }],
    usage: {
      input_tokens: promptTokens,
      output_tokens: completionTokens,
    },
  };
}

@Injectable()
export class AnthropicService {
  private readonly client: Anthropic | null = null;

  constructor(private readonly prisma: PrismaService) {
    const llmProvider = this.resolveLlmProvider();
    const isGrok = llmProvider === "groq" || llmProvider === "grok";
    if (!isGrok) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");
      this.client = new Anthropic({
        apiKey,
        baseURL: process.env.ANTHROPIC_BASE_URL,
      });
    }
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
    
    const llmProvider = this.resolveLlmProvider();
    const isGrok = llmProvider === "groq" || llmProvider === "grok";
    const model = isGrok ? grokModelFor(skill.modelTier) : this.resolveModel(skill.modelTier);
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
      let response;
      if (isGrok) {
        response = await invokeGrok({
          model,
          max_tokens: skill.tokenCeiling,
          system: skill.systemPrompt,
          messages: [
            ...(input.context
              ? [
                  {
                    role: "user",
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
      } else {
        if (!this.client) throw new Error("Anthropic client is not initialized.");
        response = await this.client.messages.create({
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
      }

      const text = (response.content as any[])
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

  private resolveLlmProvider() {
    return process.env.LLM_PROVIDER
      || (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || process.env.XAI_API_KEY ? "groq" : "")
      || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "groq");
  }
}

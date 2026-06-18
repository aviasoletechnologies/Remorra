import Anthropic from "@anthropic-ai/sdk";
import {
  AiOrchestrator,
  PrismaSkillRegistry,
  PrismaContextAssembler,
  PrismaTokenTracker,
  PrismaAuditLogger,
} from "@remorra/ai-core";
import { config, required } from "../config";
import { prisma } from "../lib/prisma";
import { withRetry } from "../lib/retry";
import { grokModelFor, invokeGrok, invokeGrokStream, streamGrok } from "./providers/grok";

export const anthropic = !config.isGrok && config.anthropicApiKey
  ? new Anthropic({
      apiKey: config.anthropicApiKey,
      baseURL: config.anthropicBaseUrl,
    })
  : null;

export function modelFor(tier: string): string {
  return required(
    tier === "fast"
      ? "ANTHROPIC_MODEL_FAST"
      : tier === "reasoning"
        ? "ANTHROPIC_MODEL_REASONING"
        : "ANTHROPIC_MODEL_STANDARD",
  );
}

export function selectedModelFor(tier: string): string {
  return config.isGrok ? grokModelFor(tier) : modelFor(tier);
}

// Build multi-turn messages for skills: conversation_history becomes actual
// user/assistant turns so the LLM sees proper context and follows its system prompt.
export function buildSkillMessages(
  sections: readonly { tag: string; trust: string; content: string }[],
): Array<{ role: string; content: string }> {
  const historySection = sections.find((s) => s.tag === "conversation_history");
  const contextSections = sections.filter((s) => s.tag !== "conversation_history");
  const contextStr = contextSections
    .map((s) => `<${s.tag} trust="${s.trust}">${s.content}</${s.tag}>`)
    .join("\n");

  const messages: Array<{ role: string; content: string }> = [];

  if (historySection) {
    const lines = historySection.content.split("\n");
    let currentRole: "user" | "assistant" | null = null;
    let currentLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("User: ")) {
        if (currentRole && currentLines.length > 0) {
          messages.push({ role: currentRole, content: currentLines.join("\n").trim() });
        }
        currentRole = "user";
        currentLines = [line.slice(6)];
      } else if (line.startsWith("Assistant: ")) {
        if (currentRole && currentLines.length > 0) {
          messages.push({ role: currentRole, content: currentLines.join("\n").trim() });
        }
        currentRole = "assistant";
        currentLines = [line.slice(11)];
      } else if (currentRole) {
        currentLines.push(line);
      }
    }
    if (currentRole && currentLines.length > 0) {
      messages.push({ role: currentRole, content: currentLines.join("\n").trim() });
    }
  }

  messages.push({ role: "user", content: contextStr });
  return messages;
}

export const orchestrator = new AiOrchestrator(
  new PrismaSkillRegistry(prisma),
  new PrismaContextAssembler(prisma),
  {
    // LlmGateway - delegates to Anthropic with retry
    async invoke(invocation) {
      const isGrok = config.isGrok;
      const model = isGrok
        ? grokModelFor(invocation.skill.modelTier)
        : modelFor(invocation.skill.modelTier);
      const messages = buildSkillMessages(invocation.sections);
      console.info(
        `[llm:invoke] skillId=${invocation.skill.id} model=${model} turns=${messages.length} systemPromptLen=${invocation.skill.systemPrompt?.length ?? 0}`,
      );
      console.info(
        `[llm:invoke] systemPrompt=${JSON.stringify(invocation.skill.systemPrompt?.slice(0, 300))}`,
      );
      messages.forEach((m, i) =>
        console.info(
          `[llm:invoke] msg[${i}] role=${m.role} content=${JSON.stringify(
            m.content.slice(0, 200),
          )}`,
        ),
      );
      const rawRetry = invocation.skill.retryPolicy as {
        limit?: number;
        backoff?: boolean;
      } | null;
      const retryPolicy = { limit: rawRetry?.limit ?? 3, backoff: rawRetry?.backoff ?? true };
      const retryContext = {
        userId: invocation.userId,
        projectId: invocation.projectId,
        skillVersionId: invocation.skill.versionId,
        model,
      };

      let response;
      if (isGrok) {
        if (invocation.onDelta) {
          response = await withRetry(async () => {
            return invokeGrokStream({
              model,
              max_tokens: invocation.skill.tokenCeiling ?? 4096,
              system: invocation.skill.systemPrompt,
              messages,
              onDelta: invocation.onDelta,
            });
          }, retryPolicy, retryContext);
        } else {
          response = await withRetry(async () => {
            return invokeGrok({
              model,
              max_tokens: invocation.skill.tokenCeiling ?? 4096,
              system: invocation.skill.systemPrompt,
              messages,
            });
          }, retryPolicy, retryContext);
        }
      } else {
        if (!anthropic) throw new Error("Anthropic client is not initialized.");
        if (invocation.onDelta) {
          response = await withRetry(async () => {
            const stream = anthropic.messages.stream({
              model,
              max_tokens: invocation.skill.tokenCeiling ?? 4096,
              system: invocation.skill.systemPrompt,
              messages: messages as any,
            });
            let streamed = "";
            stream.on("text", (delta) => {
              streamed += delta;
              void invocation.onDelta?.(delta, streamed);
            });
            return stream.finalMessage();
          }, retryPolicy, retryContext);
        } else {
          response = await withRetry(
            () =>
              anthropic.messages.create({
                model,
                max_tokens: invocation.skill.tokenCeiling ?? 4096,
                system: invocation.skill.systemPrompt,
                messages: messages as any,
              }),
            retryPolicy,
            retryContext,
          );
        }
      }

      const text = (response.content as any[])
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n");
      console.info(
        `[llm:response] skillId=${invocation.skill.id} response=${JSON.stringify(
          text.slice(0, 500),
        )}`,
      );
      return {
        value: text as any,
        usage: {
          model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        skillVersion: invocation.skill.version,
      };
    },
    async *stream(invocation) {
      const isGrok = config.isGrok;
      const messages = buildSkillMessages(invocation.sections);
      console.info(`[llm:stream] skillId=${invocation.skill.id} turns=${messages.length}`);
      messages.forEach((m, i) =>
        console.info(
          `[llm:stream] msg[${i}] role=${m.role} content=${JSON.stringify(
            m.content.slice(0, 200),
          )}`,
        ),
      );
      if (isGrok) {
        const model = grokModelFor(invocation.skill.modelTier);
        yield* streamGrok({
          model,
          max_tokens: invocation.skill.tokenCeiling ?? 4096,
          system: invocation.skill.systemPrompt,
          messages,
        });
      } else {
        if (!anthropic) throw new Error("Anthropic client is not initialized.");
        const model = modelFor(invocation.skill.modelTier);
        const stream = anthropic.messages.stream({
          model,
          max_tokens: invocation.skill.tokenCeiling ?? 4096,
          system: invocation.skill.systemPrompt,
          messages: messages as any,
        });
        for await (const event of stream) {
          if (event.type === "content_block_delta" && (event as any).delta?.text) {
            yield (event as any).delta.text;
          }
        }
      }
    },
  },
  new PrismaTokenTracker(prisma),
  new PrismaAuditLogger(prisma),
);

import Anthropic from "@anthropic-ai/sdk";
import {
  AiOrchestrator,
  PrismaSkillRegistry,
  PrismaTokenTracker,
  PrismaAuditLogger,
} from "./ai-core";
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
  const envKey = tier.toUpperCase().replace(/[:.-]/g, "_");
  if (process.env[envKey]) return process.env[envKey]!;

  if (tier === "fast") return required("ANTHROPIC_MODEL_FAST");
  if (tier === "reasoning") return required("ANTHROPIC_MODEL_REASONING");
  if (tier === "standard") return required("ANTHROPIC_MODEL_STANDARD");

  throw new Error(`Anthropic model environment variable for tier "${tier}" is required and not configured.`);
}

export function selectedModelFor(tier: string): string {
  return config.isGrok ? grokModelFor(tier) : modelFor(tier);
}

export function toYaml(val: any, indent = 0): string {
  const prefix = " ".repeat(indent);
  if (val === null || val === undefined) return "null";
  if (typeof val !== "object") {
    const str = String(val);
    if (str.includes("\n")) {
      return `|\n${str.split("\n").map(line => prefix + line).join("\n")}`;
    }
    return str;
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return "[]";
    return val.map(item => {
      if (typeof item === "object" && item !== null) {
        const itemStr = toYaml(item, indent + 2);
        const lines = itemStr.split("\n");
        const firstLine = (lines[0] ?? "").trim();
        const restLines = lines.slice(1).join("\n");
        return `${prefix}- ${firstLine}${restLines ? "\n" + restLines : ""}`;
      }
      return `${prefix}- ${toYaml(item, indent + 2)}`;
    }).join("\n");
  }
  const keys = Object.keys(val);
  if (keys.length === 0) return "{}";
  return keys.map(k => {
    const v = val[k];
    if (v === null || v === undefined) {
      return `${prefix}${k}: null`;
    }
    if (typeof v === "object") {
      const formattedValue = toYaml(v, indent + 2);
      return `${prefix}${k}:\n${formattedValue}`;
    }
    const strVal = String(v);
    if (strVal.includes("\n")) {
      const valueIndent = " ".repeat(indent + 2);
      return `${prefix}${k}: |\n${strVal.split("\n").map(line => valueIndent + line).join("\n")}`;
    }
    return `${prefix}${k}: ${strVal}`;
  }).join("\n");
}

// Build multi-turn messages for skills: conversation_history becomes actual
// user/assistant turns so the LLM sees proper context and follows its system prompt.
export function buildSkillMessages(
  sections: readonly { tag: string; trust: string; content: string }[],
): { messages: Array<{ role: string; content: string }>; trustedContext: string } {
  const historySection = sections.find((s) => s.tag === "conversation_history");
  const nonHistorySections = sections.filter((s) => s.tag !== "conversation_history");

  // V4.4 Prompt assembly rules:
  // - System prompt/constraints (skill_constraints) go in the 'system' parameter (trustedContext).
  // - Entity data, skill outputs, and KB content go in the 'messages' array as user content.
  const trustedSections = nonHistorySections.filter((s) => s.tag === "skill_constraints");
  const userSections = nonHistorySections.filter((s) => s.tag !== "skill_constraints");

  const trustedContext = trustedSections
    .map((s) => `<${s.tag}>\n${s.content}\n</${s.tag}>`)
    .join("\n");

  const contextStr = userSections
    .map((s) => {
      let content = s.content;
      if (s.tag === "application_context") {
        try {
          const parsed = JSON.parse(s.content);
          content = toYaml(parsed);
        } catch {
          // fallback to original
        }
      }
      // If it's already wrapped in XML (e.g. skill_output_* or table section tags or expertise_knowledge)
      if (content.startsWith("<") && content.endsWith(">") && content.includes("\n")) {
        return content;
      }
      return `<${s.tag} trust="${s.trust}">\n${content}\n</${s.tag}>`;
    })
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

  if (contextStr) messages.push({ role: "user", content: contextStr });
  return { messages, trustedContext };
}

export const orchestrator = new AiOrchestrator(
  new PrismaSkillRegistry(prisma),
  {
    // LlmGateway - delegates to Anthropic with retry
    async invoke(invocation) {
      const isGrok = config.isGrok;
      const model = isGrok
        ? grokModelFor(invocation.skill.modelTier ?? "standard")
        : modelFor(invocation.skill.modelTier ?? "standard");
      const { messages, trustedContext } = buildSkillMessages(invocation.sections);
      const systemPrompt = trustedContext
        ? `${invocation.skill.systemPrompt ?? ""}\n\n${trustedContext}`
        : (invocation.skill.systemPrompt ?? "");
      invocation.onLlmInput?.(systemPrompt, messages);
      console.info(
        `[llm:invoke] skillId=${invocation.skill.id} model=${model} turns=${messages.length} systemPromptLen=${systemPrompt.length}`,
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
              system: systemPrompt,
              messages,
              onDelta: invocation.onDelta,
            });
          }, retryPolicy, retryContext);
        } else {
          response = await withRetry(async () => {
            return invokeGrok({
              model,
              max_tokens: invocation.skill.tokenCeiling ?? 4096,
              system: systemPrompt,
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
              system: systemPrompt,
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
                system: systemPrompt,
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
      const { messages, trustedContext } = buildSkillMessages(invocation.sections);
      const systemPrompt = trustedContext
        ? `${invocation.skill.systemPrompt ?? ""}\n\n${trustedContext}`
        : (invocation.skill.systemPrompt ?? "");
      invocation.onLlmInput?.(systemPrompt, messages);
      console.info(`[llm:stream] skillId=${invocation.skill.id} turns=${messages.length}`);
      if (isGrok) {
        const model = grokModelFor(invocation.skill.modelTier ?? "standard");
        yield* streamGrok({
          model,
          max_tokens: invocation.skill.tokenCeiling ?? 4096,
          system: systemPrompt,
          messages,
        });
      } else {
        if (!anthropic) throw new Error("Anthropic client is not initialized.");
        const model = modelFor(invocation.skill.modelTier ?? "standard");
        const stream = anthropic.messages.stream({
          model,
          max_tokens: invocation.skill.tokenCeiling ?? 4096,
          system: systemPrompt,
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

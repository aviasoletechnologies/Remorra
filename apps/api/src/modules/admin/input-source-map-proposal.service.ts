import Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";

function resolveLlmProvider(): string {
  return process.env.LLM_PROVIDER
    || (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || process.env.XAI_API_KEY ? "groq" : "")
    || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "groq");
}

function grokModelFor() {
  const model = process.env.GROK_MODEL_FAST
    || process.env.GROQ_MODEL_FAST
    || process.env.GROK_MODEL_STANDARD
    || process.env.GROQ_MODEL_STANDARD;
  if (!model) throw new Error("Grok/Groq model environment variable is required");
  return model;
}

async function invokeGrok(input: {
  model: string;
  system: string;
  content: string;
}) {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const isGroq = !!process.env.GROQ_API_KEY || apiKey.startsWith("gsk_");
  const baseUrl = process.env.GROK_BASE_URL
    || process.env.GROQ_BASE_URL
    || (isGroq ? "https://api.groq.com/openai/v1" : "https://api.x.ai/v1");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 1200,
      temperature: 0,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.content },
      ],
    }),
  });
  if (!response.ok) return null;
  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

@Injectable()
export class InputSourceMapProposalService {
  private readonly client: Anthropic | null;

  constructor() {
    const apiKey = resolveLlmProvider() === "groq" || resolveLlmProvider() === "grok"
      ? null
      : process.env.ANTHROPIC_API_KEY;
    this.client = apiKey
      ? new Anthropic({ apiKey, baseURL: process.env.ANTHROPIC_BASE_URL })
      : null;
  }

  async propose(inputRequirementText: string): Promise<unknown | null> {
    const system = [
      "You propose JSON source maps for skill input requirements.",
      "Return JSON only. Do not include markdown.",
      "Only use entities, fields, and runtime scope values from the provided registry.",
      "If unclear, return {\"requiredInputs\":[]}.",
    ].join(" ");
    const content = JSON.stringify({
      inputRequirementText,
      instruction: "Build a valid inputSourceMap with database, url, or skill_output source types. Use explicit entity, field, and scope values. For database sources, set scope with $runtime.projectId or $runtime.conversationId.",
      outputShape: {
        requiredInputs: [
          {
            key: "camelCaseName",
            description: "Short human description",
            required: true,
            source: {
              type: "database",
              entity: "Project",
              field: "name",
              scope: { id: "$runtime.projectId" },
              limit: 1,
            },
          },
        ],
      },
    });

    let text: string | null = null;
    const provider = resolveLlmProvider();
    if (provider === "groq" || provider === "grok") {
      text = await invokeGrok({ model: grokModelFor(), system, content });
    } else if (this.client) {
      const model = process.env.ANTHROPIC_MODEL_FAST ?? process.env.ANTHROPIC_MODEL_STANDARD;
      if (!model) return null;
      const response = await this.client.messages.create({
        model,
        max_tokens: 1200,
        temperature: 0,
        system,
        messages: [{ role: "user", content }],
      });
      text = (response.content as any[])
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n")
        .trim();
    }

    if (!text) return null;
    return JSON.parse(text);
  }
}

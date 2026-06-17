import { Injectable, Logger } from "@nestjs/common";
import Anthropic from "@anthropic-ai/sdk";
import { PrismaService } from "../../infrastructure/prisma.service.js";
import { ResponseParser } from "@remorra/ai-core";

type IntentCandidate = {
  skillId: string;
  name: string;
  description: string;
};

type IntentRouteResult = {
  routeType: "general" | "skill";
  skillId: string | null;
  confidence: number;
  reason: string;
};

const INTENT_ROUTER_SYSTEM_PROMPT = [
  "You are an intent router. Respond with a single JSON object only — no markdown, no code fences, no prose.",
  "Decide whether the user message is general conversation or product intent.",
  "General: greetings, small talk, thanks, yes/no responses, one-word answers, or anything not about building/planning/validating a product.",
  "Skill: the user is describing, planning, building, improving, validating, or comparing a product or feature.",
  "If general, set routeType to \"general\" and skillId to null.",
  "If skill, set routeType to \"skill\" and choose exactly one skillId from the provided list.",
  "Do not guess if unsure — default to general.",
  "Valid JSON examples:",
  "{\"routeType\":\"general\",\"skillId\":null,\"confidence\":0.99,\"reason\":\"Greeting only\"}",
  "{\"routeType\":\"skill\",\"skillId\":\"brain-dump-facilitator\",\"confidence\":0.91,\"reason\":\"Broad product idea\"}",
  "Output must be valid JSON with exactly these keys: routeType, skillId, confidence, reason.",
].join(" ");

// Only unambiguous single-word/emoji greetings — everything else goes to LLM with prefill.
const SMALL_TALK_PATTERNS = [
  /^h+i+[!.\s]*$/i,
  /^h+e+l+o+[!.\s]*$/i,
  /^hey[!.\s]*$/i,
  /^hello[!.\s]*$/i,
  /^thanks?[!.\s]*$/i,
  /^thank\s+you[!.\s]*$/i,
  /^ty[!.\s]*$/i,
  /^ok[!.\s]*$/i,
  /^okay[!.\s]*$/i,
  /^bye[!.\s]*$/i,
  /^goodbye[!.\s]*$/i,
  /^good\s+(morning|afternoon|evening|night)[!.\s]*$/i,
  /^howdy[!.\s]*$/i,
  /^sup[!.\s]*$/i,
  /^yo[!.\s]*$/i,
  /^greetings[!.\s]*$/i,
  /^👋+$/,
];

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
export class IntentRouterService {
  private readonly client: Anthropic | null = null;
  private readonly logger = new Logger(IntentRouterService.name);

  constructor(private readonly prisma: PrismaService) {
    const llmProvider = process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "groq");
    const isGrok = llmProvider === "groq" || llmProvider === "grok";
    if (!isGrok) {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        this.client = new Anthropic({
          apiKey,
          baseURL: process.env.ANTHROPIC_BASE_URL,
        });
      }
    }
  }

  async routeMessage(projectId: string, userId: string, content: string): Promise<IntentRouteResult> {
    if (this.isSmallTalk(content)) {
      this.logger.debug(`Small-talk guard fired — skipping LLM routing project=${projectId} user=${userId}`);
      return { routeType: "general", skillId: null, confidence: 1, reason: "Greeting or small talk." };
    }

    const candidates = await this.loadCandidates();
    if (!candidates.length) {
      this.logger.warn(`No active skills available for intent routing project=${projectId} user=${userId}`);
      return { routeType: "general", skillId: null, confidence: 0, reason: "No active skills are available." };
    }

    this.logger.debug(
      `Routing intent project=${projectId} user=${userId} candidates=${candidates.length} messagePreview=${content.slice(0, 120)}`,
    );

    const llmProvider = process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "groq");
    const isGrok = llmProvider === "groq" || llmProvider === "grok";
    let text = "";
    const userPrompt = [
      `User message: ${content}`,
      "Available skills:",
      ...candidates.map((skill) => `- ${skill.skillId} | ${skill.name} | ${skill.description}`),
    ].join("\n");

    if (isGrok) {
      try {
        const model = grokModelFor("fast");
        const response = await invokeGrok({
          model,
          max_tokens: 256,
          temperature: 0,
          system: INTENT_ROUTER_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userPrompt }],
        });
        text = response.content[0]?.text ?? "";
      } catch (error: any) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Intent router Grok call failed project=${projectId} user=${userId}; ${message}`,
        );
        if (!this.client) {
          this.logger.warn(
            `Intent router has no Anthropic fallback project=${projectId} user=${userId}; defaulting to general`,
          );
          return {
            routeType: "general",
            skillId: null,
            confidence: 0,
            reason: "Intent router provider was unavailable.",
          };
        }
      }
    }

    if (!text) {
      if (!this.client) {
        this.logger.warn(
          `Intent router produced no text and Anthropic is unavailable project=${projectId} user=${userId}`,
        );
        return {
          routeType: "general",
          skillId: null,
          confidence: 0,
          reason: "Intent router provider returned no response.",
        };
      }
      const model = process.env.ANTHROPIC_MODEL_FAST ?? process.env.ANTHROPIC_MODEL_STANDARD ?? "claude-sonnet-4-6";
      const response = await this.client.messages.create({
        model,
        max_tokens: 256,
        temperature: 0,
        system: INTENT_ROUTER_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
      text = response.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n");
    }

    this.logger.debug(
      `Intent router raw response project=${projectId} user=${userId} raw=${text.slice(0, 400)}`,
    );

    const parsed = this.parseIntentResponse(text, candidates);

    // If JSON parse failed entirely, default to general — never infer skill from prose.
    if (!parsed.routeType) {
      this.logger.warn(`Intent router returned non-JSON response — defaulting to general project=${projectId} user=${userId} raw=${text.slice(0, 200)}`);
      return { routeType: "general", skillId: null, confidence: 0, reason: "Router response was not valid JSON." };
    }

    const routeType = parsed.routeType;
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const reason = typeof parsed.reason === "string" ? parsed.reason : "No reason provided.";

    if (routeType === "general") {
      this.logger.debug(`Intent routed to general chat project=${projectId} user=${userId} confidence=${confidence} reason=${reason}`);
      return { routeType: "general", skillId: null, confidence, reason };
    }

    // routeType === "skill" — require a valid skillId from the candidates list.
    const selectedSkillId = typeof parsed.skillId === "string" && candidates.some((item) => item.skillId === parsed.skillId)
      ? parsed.skillId
      : null;

    if (!selectedSkillId) {
      this.logger.warn(`Intent router returned skill route but no valid skillId project=${projectId} user=${userId} parsedSkillId=${String(parsed.skillId)} — defaulting to general`);
      return { routeType: "general", skillId: null, confidence: 0, reason: "Router returned skill route but skillId was invalid." };
    }

    this.logger.debug(`Intent routed to skill project=${projectId} user=${userId} skillId=${selectedSkillId} confidence=${confidence} reason=${reason}`);
    return { routeType: "skill", skillId: selectedSkillId, confidence, reason };
  }

  private isSmallTalk(content: string): boolean {
    return SMALL_TALK_PATTERNS.some((pattern) => pattern.test(content.trim()));
  }

  private async loadCandidates(): Promise<IntentCandidate[]> {
    const skills = await this.prisma.client.skill.findMany({
      include: {
        versions: {
          where: { active: true },
          orderBy: { version: "desc" },
          take: 1,
        },
      },
      orderBy: { id: "asc" },
    });

    return skills
      .filter((skill: any) => skill.versions?.[0])
      .map((skill: any) => ({
        skillId: skill.id,
        name: skill.name,
        description: skill.description,
      }));
  }

  private parseIntentResponse(text: string, candidates: IntentCandidate[]): Partial<IntentRouteResult> {
    try {
      return ResponseParser.extractJson(text) as Partial<IntentRouteResult>;
    } catch {
      this.logger.warn(`Failed to parse intent router JSON response, falling back to regex extraction.`);
      const objectMatch = text.match(/\{[\s\S]*\}/);
      if (!objectMatch) {
        return this.inferIntentFromText(text, candidates);
      }

      try {
        return JSON.parse(objectMatch[0]) as Partial<IntentRouteResult>;
      } catch {
        return this.inferIntentFromText(text, candidates);
      }
    }
  }

  private inferIntentFromText(text: string, candidates: IntentCandidate[]): Partial<IntentRouteResult> {
    const normalized = text.toLowerCase();
    const matched = candidates.filter((candidate) => {
      const skillId = candidate.skillId.toLowerCase();
      const skillName = candidate.name.toLowerCase();
      return normalized.includes(skillId) || normalized.includes(skillName);
    });

    if (matched.length !== 1) {
      return {};
    }

    const selected = matched[0]!;

    return {
      routeType: "skill",
      skillId: selected.skillId,
      confidence: 0.5,
      reason: `Inferred from model text mentioning ${selected.name}.`,
    };
  }

}

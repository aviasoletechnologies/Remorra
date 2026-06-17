export function grokModelFor(tier: string): string {
  const apiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY || process.env.GROQ_API_KEY;
  const isGroq = !!process.env.GROQ_API_KEY || (typeof apiKey === "string" && apiKey.startsWith("gsk_"));
  const defaultModel = isGroq ? "llama-3.3-70b-versatile" : "grok-2-1212";

  if (tier === "fast") return process.env.GROK_MODEL_FAST || process.env.GROQ_MODEL_FAST || defaultModel;
  if (tier === "reasoning") return process.env.GROK_MODEL_REASONING || process.env.GROQ_MODEL_REASONING || defaultModel;
  return process.env.GROK_MODEL_STANDARD || process.env.GROQ_MODEL_STANDARD || defaultModel;
}

export async function* streamGrok(input: {
  model: string;
  max_tokens?: number;
  system?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
}): AsyncGenerator<string, void, unknown> {
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
    stream: true,
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
    throw new Error(`Grok Streaming API error (${res.status}): ${errorText}`);
  }

  if (!res.body) throw new Error("Response body is empty");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("data:")) {
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === "[DONE]") break;
          try {
            const data = JSON.parse(dataStr);
            const delta = data.choices[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          } catch {
            // ignore parse errors for keepalives
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function invokeGrokStream(input: {
  model: string;
  max_tokens?: number;
  system?: string;
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  onDelta?: (delta: string, accumulated: string) => void | Promise<void>;
}) {
  let accumulated = "";
  for await (const delta of streamGrok(input)) {
    accumulated += delta;
    if (input.onDelta) {
      await input.onDelta(delta, accumulated);
    }
  }

  const promptTokens = Math.ceil((JSON.stringify(input.messages).length + (input.system?.length ?? 0)) / 4);
  const completionTokens = Math.ceil(accumulated.length / 4);

  return {
    content: [{ type: "text", text: accumulated }],
    usage: {
      input_tokens: promptTokens,
      output_tokens: completionTokens,
    },
  };
}

export async function invokeGrok(input: {
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

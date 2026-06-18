import Anthropic from "@anthropic-ai/sdk";
import { Injectable } from "@nestjs/common";
import { listInputSourceRegistry } from "@remorra/ai-core";

@Injectable()
export class InputSourceMapProposalService {
  private readonly client: Anthropic | null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    this.client = apiKey
      ? new Anthropic({ apiKey, baseURL: process.env.ANTHROPIC_BASE_URL })
      : null;
  }

  async propose(inputRequirementText: string): Promise<unknown | null> {
    const model = process.env.ANTHROPIC_MODEL_FAST ?? process.env.ANTHROPIC_MODEL_STANDARD;
    if (!this.client || !model) return null;

    const response = await this.client.messages.create({
      model,
      max_tokens: 1200,
      temperature: 0,
      system: [
        "You propose JSON source maps for skill input requirements.",
        "Return JSON only. Do not include markdown.",
        "Only use entities, fields, and runtime scope values from the provided registry.",
        "If unclear, return {\"requiredInputs\":[]}.",
      ].join(" "),
      messages: [
        {
          role: "user",
          content: JSON.stringify({
            inputRequirementText,
            allowedRegistry: listInputSourceRegistry(),
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
          }),
        },
      ],
    });

    const text = (response.content as any[])
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n")
      .trim();
    if (!text) return null;
    return JSON.parse(text);
  }
}

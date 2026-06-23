export class ResponseParser {
  static extractJson(text: string): unknown {
    const dataMatch = text.match(/<output_data>\s*([\s\S]*?)<\/output_data>/i)?.[1];
    const fenced = dataMatch ?? text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
    const cleaned = fenced.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    return JSON.parse(cleaned);
  }

  static validate(
    data: unknown,
    schema: Record<string, unknown>,
  ): { valid: boolean; data: unknown; errors?: string[] } {
    if (!schema || Object.keys(schema).length === 0) {
      return { valid: true, data };
    }

    if (
      schema.type === "object" &&
      schema.required &&
      Array.isArray(schema.required)
    ) {
      const obj = data as Record<string, unknown>;
      const missing = (schema.required as string[]).filter(
        (key) => !(key in obj),
      );
      if (missing.length > 0) {
        return {
          valid: false,
          data,
          errors: missing.map((k) => `Missing required field: ${k}`),
        };
      }
    }

    return { valid: true, data };
  }

  static parseAndValidate(
    text: string,
    schema: Record<string, unknown>,
  ): { valid: boolean; data: unknown; errors?: string[] } {
    const data = ResponseParser.extractJson(text);
    return ResponseParser.validate(data, schema);
  }
}

export function jsonValue(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

export function parseJson(text: string): unknown {
  return ResponseParser.extractJson(text);
}

export function parseAndValidateJson(
  text: string,
  outputSchema: Record<string, unknown>,
): unknown {
  const result = ResponseParser.parseAndValidate(text, outputSchema);
  if (!result.valid) {
    console.warn("[response-parser] Schema validation warnings:", result.errors);
  }
  return result.data;
}

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
}

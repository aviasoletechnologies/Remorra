import { ResponseParser } from "@remorra/ai-core";

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

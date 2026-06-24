import { vi, describe, expect, it } from "vitest";

vi.mock("../config", () => {
  return {
    config: {
      databaseUrl: "postgresql://mock",
      isGrok: false,
      anthropicApiKey: "mock-key",
      supabaseUrl: "https://mock",
      supabaseServiceRoleKey: "mock-key",
    },
    required: (name: string) => "mock-value",
  };
});

vi.mock("../lib/prisma", () => {
  return {
    prisma: {},
  };
});

import { toYaml, buildSkillMessages } from "./llm";

describe("LLM Service - Context Formatting to YAML", () => {
  describe("toYaml helper", () => {
    it("handles primitives (null, undefined, strings, numbers, booleans)", () => {
      expect(toYaml(null)).toBe("null");
      expect(toYaml(undefined)).toBe("null");
      expect(toYaml("hello")).toBe("hello");
      expect(toYaml(42)).toBe("42");
      expect(toYaml(true)).toBe("true");
    });

    it("handles simple flat objects", () => {
      const obj = { name: "yash", phase: "discover" };
      const expected = [
        "name: yash",
        "phase: discover"
      ].join("\n");
      expect(toYaml(obj)).toBe(expected);
    });

    it("handles nested objects with correct indentation", () => {
      const obj = {
        Project: {
          name: "yash",
          summary: "bill tracker"
        }
      };
      const expected = [
        "Project:",
        "  name: yash",
        "  summary: bill tracker"
      ].join("\n");
      expect(toYaml(obj)).toBe(expected);
    });

    it("handles arrays of primitive values", () => {
      const obj = {
        tags: ["finance", "bills"]
      };
      const expected = [
        "tags:",
        "  - finance",
        "  - bills"
      ].join("\n");
      expect(toYaml(obj)).toBe(expected);
    });

    it("handles arrays of objects with aligned keys", () => {
      const obj = {
        UserStories: [
          { id: 1, title: "Add bills" },
          { id: 2, title: "Pay bills" }
        ]
      };
      const expected = [
        "UserStories:",
        "  - id: 1",
        "    title: Add bills",
        "  - id: 2",
        "    title: Pay bills"
      ].join("\n");
      expect(toYaml(obj)).toBe(expected);
    });

    it("handles multi-line strings with block scalar syntax and proper indent", () => {
      const obj = {
        summary: "A bill tracker\nthat reduces stress\nand avoids late fees."
      };
      const expected = [
        "summary: |",
        "  A bill tracker",
        "  that reduces stress",
        "  and avoids late fees."
      ].join("\n");
      expect(toYaml(obj)).toBe(expected);
    });
  });

  describe("buildSkillMessages integration", () => {
    it("converts application_context JSON section into YAML inside the final user message", () => {
      const sections = [
        {
          tag: "application_context",
          trust: "application",
          content: JSON.stringify({
            Project: {
              name: "yash",
              summary: "A bill tracker"
            }
          })
        },
        {
          tag: "user_message",
          trust: "user",
          content: "what?"
        }
      ];

      const result = buildSkillMessages(sections);
      const { messages } = result;

      expect(messages).toHaveLength(1);
      expect(messages[0]!.role).toBe("user");
      
      const expectedYaml = [
        "Project:",
        "  name: yash",
        "  summary: A bill tracker"
      ].join("\n");

      expect(messages[0]!.content).toContain("<application_context trust=\"application\">");
      expect(messages[0]!.content).toContain(expectedYaml);
      expect(messages[0]!.content).toContain("</application_context>");
      expect(messages[0]!.content).toContain("<user_message trust=\"user\">what?</user_message>");
    });

    it("falls back to raw content if application_context is not valid JSON", () => {
      const sections = [
        {
          tag: "application_context",
          trust: "application",
          content: "invalid json string"
        }
      ];

      const result = buildSkillMessages(sections);
      expect(result.messages[0]!.content).toContain("invalid json string");
    });
  });
});

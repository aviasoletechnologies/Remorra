import { describe, expect, it } from "vitest";
import {
  ContextAssemblyMissingDataError,
  PrismaContextAssembler,
  generateInputSourceMap,
  validateInputSourceMap,
} from "./prisma-implementations";

describe("dynamic input source maps", () => {
  it("generates a valid source map from deterministic requirement text", () => {
    const result = generateInputSourceMap("Need project name and project summary");

    expect(result.valid).toBe(true);
    expect(result.map.requiredInputs).toEqual([
      expect.objectContaining({
        key: "projectName",
        source: expect.objectContaining({ entity: "Project", field: "name" }),
      }),
      expect.objectContaining({
        key: "projectSummary",
        source: expect.objectContaining({ entity: "Project", field: "summary" }),
      }),
    ]);
  });

  it("marks unclear requirement text invalid instead of saving a guessed map", () => {
    const result = generateInputSourceMap("Need the magic founder signal");

    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Could not map");
    expect(result.map.requiredInputs).toEqual([]);
  });

  it("rejects source maps that reference unknown entities or fields", () => {
    const result = validateInputSourceMap({
      requiredInputs: [
        {
          key: "bad",
          description: "Bad source",
          required: true,
          source: {
            type: "database",
            entity: "UnknownEntity",
            field: "name",
            scope: { projectId: "$runtime.projectId" },
          },
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("bad: unknown entity UnknownEntity");
  });

  it("assembles mapped database values and fails before LLM when required data is missing", async () => {
    const prisma = {
      project: {
        findFirst: async () => ({ id: "project-1", name: "Alpha", summary: null }),
      },
    };
    const assembler = new PrismaContextAssembler(prisma);

    const sections = await assembler.assemble("project-1", [], {
      inputSourceMap: {
        requiredInputs: [
          {
            key: "projectName",
            description: "Project name",
            required: true,
            source: {
              type: "database",
              entity: "Project",
              field: "name",
              scope: { projectId: "$runtime.projectId" },
            },
          },
        ],
      },
      runtime: { projectId: "project-1" },
    });

    expect(sections).toEqual([
      {
        tag: "resolved_skill_inputs",
        trust: "trusted",
        content: JSON.stringify({ projectName: "Alpha" }),
      },
    ]);

    await expect(
      assembler.assemble("project-1", [], {
        inputSourceMap: {
          requiredInputs: [
            {
              key: "projectSummary",
              description: "Project summary",
              required: true,
              source: {
                type: "database",
                entity: "Project",
                field: "summary",
                scope: { projectId: "$runtime.projectId" },
              },
            },
          ],
        },
        runtime: { projectId: "project-1" },
      }),
    ).rejects.toThrow(ContextAssemblyMissingDataError);
  });
});

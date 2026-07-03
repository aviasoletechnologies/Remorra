import { describe, expect, it, vi, beforeEach } from "vitest";
import { assembleContext } from "./context";
import { prisma } from "../lib/prisma";

vi.mock("../lib/prisma", () => {
  return {
    prisma: {
      conversationMessage: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      structuredExtract: {
        findFirst: vi.fn(),
      },
      project: {
        findUniqueOrThrow: vi.fn(),
      },
      goal: {
        findMany: vi.fn(),
      },
    },
  };
});

describe("assembleContext Service Tests", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns structured JSON output when extract exists for skill", async () => {
    vi.mocked(prisma.conversationMessage.findFirst)
      .mockResolvedValueOnce({ conversationId: "conv-1" } as any) // lastMsg
      .mockResolvedValueOnce(null); // lastAssistant (not reached)

    vi.mocked(prisma.structuredExtract.findFirst).mockResolvedValue({
      payload: { operations: [{ action: "create", entity: "Persona" }] },
    } as any);

    const sections = await assembleContext("p1", { skills: ["skill-a"] });

    expect(prisma.structuredExtract.findFirst).toHaveBeenCalledWith({
      where: { conversationId: "conv-1" },
      orderBy: { createdAt: "desc" },
    });

    expect(sections).toHaveLength(1);
    expect(sections[0]!.tag).toBe("skill_output_skill_a");
    expect(sections[0]!.content).toContain("<skill_output_skill_a>");
    expect(sections[0]!.content).toContain('"entity": "Persona"');
  });

  it("falls back to last assistant message when no extract exists", async () => {
    vi.mocked(prisma.conversationMessage.findFirst)
      .mockResolvedValueOnce({ conversationId: "conv-1" } as any) // lastMsg
      .mockResolvedValueOnce({ content: "Here is my analysis.", role: "assistant" } as any); // lastAssistant

    vi.mocked(prisma.structuredExtract.findFirst).mockResolvedValue(null);

    const sections = await assembleContext("p1", { skills: ["skill-a"] });

    expect(sections).toHaveLength(1);
    expect(sections[0]!.tag).toBe("skill_output_skill_a");
    expect(sections[0]!.content).toContain("Here is my analysis.");
  });

  it("returns empty sections when skill has no messages", async () => {
    vi.mocked(prisma.conversationMessage.findFirst).mockResolvedValue(null);

    const sections = await assembleContext("p1", { skills: ["skill-a"] });

    expect(sections).toHaveLength(0);
  });

  it("skips current skill to avoid duplicate with conversation_history", async () => {
    const sections = await assembleContext("p1", { skills: ["skill-a"] }, undefined, "skill-a");

    expect(prisma.conversationMessage.findFirst).not.toHaveBeenCalled();
    expect(sections).toHaveLength(0);
  });

  it("always includes the triggering skill's output as a baseline default (previousSkillId)", async () => {
    vi.mocked(prisma.conversationMessage.findFirst).mockResolvedValueOnce({ conversationId: "conv-1" } as any);
    vi.mocked(prisma.structuredExtract.findFirst).mockResolvedValue({
      payload: { result: "extracted data" },
    } as any);

    // No explicit sources configured at all — the skill that triggered this
    // turn is still resolved automatically, no config required.
    const sections = await assembleContext("p1", {}, "first-skill");

    expect(prisma.conversationMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ skillId: "first-skill" }) }),
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]!.tag).toBe("skill_output_first_skill");
  });

  it("combines the baseline previous-skill output with explicitly configured extra sources (flow-issues.md #1/#29)", async () => {
    vi.mocked(prisma.conversationMessage.findFirst)
      .mockResolvedValueOnce({ conversationId: "conv-1" } as any)
      .mockResolvedValueOnce({ conversationId: "conv-2" } as any);

    vi.mocked(prisma.structuredExtract.findFirst).mockResolvedValue({
      payload: { result: "extracted data" },
    } as any);

    // Admin explicitly selected one extra source ("skill-a") via "also use
    // other skill output" — it must combine with the baseline (previousSkillId),
    // not replace it, and not be silently dropped by whichever configured
    // second.
    const sections = await assembleContext("p1", { skills: ["skill-a"] }, "triggering-skill");

    expect(prisma.conversationMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ skillId: "triggering-skill" }) }),
    );
    expect(prisma.conversationMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ skillId: "skill-a" }) }),
    );
    expect(sections).toHaveLength(2);
  });

  it("filters out the legacy @previous keyword without double-adding the baseline", async () => {
    vi.mocked(prisma.conversationMessage.findFirst).mockResolvedValueOnce({ conversationId: "conv-1" } as any);
    vi.mocked(prisma.structuredExtract.findFirst).mockResolvedValue({
      payload: { result: "extracted data" },
    } as any);

    const sections = await assembleContext("p1", { skills: ["@previous"] }, "first-skill");

    // Resolves via the baseline default, not the literal "@previous" string —
    // exactly one call, not two.
    expect(prisma.conversationMessage.findFirst).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(1);
  });

  it("resolves nothing when there is no triggering skill and no explicit sources configured", async () => {
    const sections = await assembleContext("p1", {}, undefined);
    expect(prisma.conversationMessage.findFirst).not.toHaveBeenCalled();
    expect(sections).toHaveLength(0);
  });

  it("filters project tables and specific columns dynamically", async () => {
    vi.mocked(prisma.project.findUniqueOrThrow).mockResolvedValue({
      id: "p1",
      name: "Test Project",
      summary: "My summary",
      phase: "discover",
    } as any);

    vi.mocked(prisma.goal.findMany).mockResolvedValue([
      { id: "goal-1", title: "Scale to 10k users", detail: "Using SEO", ignoredField: "secret" },
    ] as any);

    const sections = await assembleContext("p1", {
      tables: {
        Project: ["name", "summary"],
        Goal: ["id", "title"],
      },
    });

    expect(sections).toHaveLength(2);
    expect(sections[0]!.tag).toBe("project_metadata");
    expect(sections[0]!.content).toContain("<project_metadata>");
    expect(sections[0]!.content).toContain("name: Test Project");
    expect(sections[0]!.content).toContain("summary: My summary");

    expect(sections[1]!.tag).toBe("goals_all");
    expect(sections[1]!.content).toContain("<goals_all>");
    expect(sections[1]!.content).toContain("id: goal-1");
    expect(sections[1]!.content).toContain("title: Scale to 10k users");
  });

  it("returns all columns if only table is selected with empty columns array", async () => {
    vi.mocked(prisma.goal.findMany).mockResolvedValue([
      { id: "goal-1", title: "Scale to 10k users", detail: "Using SEO" },
    ] as any);

    const sections = await assembleContext("p1", { tables: { Goal: [] } });

    expect(sections).toHaveLength(1);
    expect(sections[0]!.tag).toBe("goals_all");
    expect(sections[0]!.content).toContain("<goals_all>");
    expect(sections[0]!.content).toContain("id: goal-1");
    expect(sections[0]!.content).toContain("title: Scale to 10k users");
    expect(sections[0]!.content).toContain("detail: Using SEO");
  });
});

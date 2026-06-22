import { describe, expect, it, vi, beforeEach } from "vitest";
import { assembleContext } from "./context";
import { prisma } from "../lib/prisma";

// Mock the prisma client import with dynamic delegate mocks
vi.mock("../lib/prisma", () => {
  return {
    prisma: {
      conversationMessage: {
        findMany: vi.fn(),
      },
      project: {
        findUniqueOrThrow: vi.fn(),
      },
      ambition: {
        findMany: vi.fn(),
      },
    },
  };
});

describe("assembleContext Service Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and formats other skills' conversations", async () => {
    const mockMessages = [
      { role: "user", content: "Hello from skill A", createdAt: new Date(1000) },
      { role: "assistant", content: "Response from skill A", createdAt: new Date(2000) },
    ];

    vi.mocked(prisma.conversationMessage.findMany).mockResolvedValue(mockMessages as any);

    const sections = await assembleContext("p1", {
      skills: ["skill-a"],
    });

    expect(prisma.conversationMessage.findMany).toHaveBeenCalledWith({
      where: {
        conversation: {
          projectId: "p1",
        },
        skillId: "skill-a",
      },
      orderBy: { createdAt: "asc" },
    });

    expect(sections).toHaveLength(1);
    expect(sections[0]!.tag).toBe("skill_conversation_history_skill_a");
    expect(sections[0]!.content).toContain("Conversation history for skill skill-a:");
    expect(sections[0]!.content).toContain("User: Hello from skill A");
    expect(sections[0]!.content).toContain("Assistant: Response from skill A");
  });

  it("filters project tables and specific columns dynamically", async () => {
    vi.mocked(prisma.project.findUniqueOrThrow).mockResolvedValue({
      id: "p1",
      name: "Test Project",
      summary: "My summary",
      phase: "discover",
    } as any);

    vi.mocked(prisma.ambition.findMany).mockResolvedValue([
      { id: "ambition-1", title: "Scale to 10k users", detail: "Using SEO", ignoredField: "secret" },
    ] as any);

    const sections = await assembleContext("p1", {
      tables: {
        Project: ["name", "summary"],
        Ambition: ["id", "title"],
      },
    });

    expect(sections).toHaveLength(1);
    expect(sections[0]!.tag).toBe("application_context");
    
    const parsedContent = JSON.parse(sections[0]!.content);
    expect(parsedContent.Project).toEqual({
      name: "Test Project",
      summary: "My summary",
    });
    expect(parsedContent.Ambition).toEqual([
      {
        id: "ambition-1",
        title: "Scale to 10k users",
      },
    ]);
  });

  it("returns all columns if only table is selected with empty columns array dynamically", async () => {
    vi.mocked(prisma.ambition.findMany).mockResolvedValue([
      { id: "ambition-1", title: "Scale to 10k users", detail: "Using SEO" },
    ] as any);

    const sections = await assembleContext("p1", {
      tables: {
        Ambition: [], // empty array means "select only table, pass all columns"
      },
    });

    expect(sections).toHaveLength(1);
    const parsedContent = JSON.parse(sections[0]!.content);
    
    expect(parsedContent.Ambition[0]!).toEqual({
      id: "ambition-1",
      title: "Scale to 10k users",
      detail: "Using SEO",
    });
  });
});

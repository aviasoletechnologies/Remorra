import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma", () => {
  return {
    prisma: {
      persona: {
        create: vi.fn(),
      },
      painPoint: {
        create: vi.fn(),
      },
    },
  };
});

import { prisma } from "../lib/prisma";
import { applyOperationsExtract } from "./extract-mapper";

describe("applyOperationsExtract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("resolves child operations when the AI removes spacing from a created persona ref", async () => {
    vi.mocked(prisma.persona.create).mockResolvedValue({
      id: "persona-1",
      name: "Online Learner",
    } as any);
    vi.mocked(prisma.painPoint.create).mockResolvedValue({ id: "pain-1" } as any);

    const events = await applyOperationsExtract("project-1", "user-1", {
      operations: [
        {
          action: "create",
          entity: "Persona",
          data: {
            name: "Online Learner",
            description: "Students and working professionals.",
          },
        },
        {
          action: "create",
          entity: "PainPoint",
          data: {
            personaId: "$OnlineLearner",
            statement: "Too many course options and unclear recommendations.",
          },
        },
      ],
    });

    expect(prisma.persona.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        name: "Online Learner",
        description: "Students and working professionals.",
      },
    });
    expect(prisma.painPoint.create).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        personaId: "persona-1",
        statement: "Too many course options and unclear recommendations.",
      },
    });
    expect(events).toEqual(["persona.create", "pain_point.create"]);
  });

  it("does not resolve an ambiguous normalized ref", async () => {
    vi.mocked(prisma.persona.create)
      .mockResolvedValueOnce({ id: "persona-1", name: "A B" } as any)
      .mockResolvedValueOnce({ id: "persona-2", name: "AB" } as any);

    const events = await applyOperationsExtract("project-1", "user-1", {
      operations: [
        {
          action: "create",
          entity: "Persona",
          data: { name: "A B", description: "First persona." },
        },
        {
          action: "create",
          entity: "Persona",
          data: { name: "AB", description: "Second persona." },
        },
        {
          action: "create",
          entity: "PainPoint",
          data: {
            personaId: "$ab",
            statement: "Ambiguous normalized reference.",
          },
        },
      ],
    });

    expect(prisma.painPoint.create).not.toHaveBeenCalled();
    expect(events).toEqual(["persona.create", "persona.create"]);
  });
});

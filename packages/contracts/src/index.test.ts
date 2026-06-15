import { describe, expect, it } from "vitest";
import {
  invitationInputSchema,
  reportTypeSchema,
  storyInputSchema,
  taskMoveSchema,
} from "./index";

describe("production contracts", () => {
  it("prevents founders from inviting another founder role", () => {
    expect(() =>
      invitationInputSchema.parse({
        email: "person@example.com",
        role: "founder",
      }),
    ).toThrow();
  });

  it("requires stories to have exactly one parent need", () => {
    expect(
      storyInputSchema.parse({
        userNeedId: "11111111-1111-4111-8111-111111111111",
        title: "Understand the riskiest assumption",
      }).userNeedId,
    ).toBe("11111111-1111-4111-8111-111111111111");
  });

  it("accepts only the five configured report identifiers", () => {
    expect(reportTypeSchema.parse("product-health")).toBe("product-health");
    expect(() => reportTypeSchema.parse("custom-hidden-report")).toThrow();
  });

  it("requires an optimistic version on task moves", () => {
    expect(() =>
      taskMoveSchema.parse({ status: "done", position: 0 }),
    ).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import { assertConversationAllowed } from "./evolve.service.js";

describe("Evolve policy", () => {
  it("blocks conversation in publish mode", () => {
    expect(() => assertConversationAllowed("publish")).toThrow(
      "Publish sessions do not allow conversation.",
    );
  });

  it("allows ideate conversation", () => {
    expect(() => assertConversationAllowed("ideate")).not.toThrow();
  });
});

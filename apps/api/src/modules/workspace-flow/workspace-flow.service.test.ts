import { describe, expect, it } from "vitest";
import { hasValue, nextStepKey, requiredKeys } from "./workspace-flow.service.js";

describe("workspace flow rules", () => {
  it("reads only declared required output keys", () => {
    expect(requiredKeys(["problemStatement", "targetAudience", 42])).toEqual([
      "problemStatement",
      "targetAudience",
    ]);
  });

  it("uses explicit transition rules and never event mappings for ordering", () => {
    expect(nextStepKey({ transitionRules: { nextStepKey: "refine-strategy" } })).toBe(
      "refine-strategy",
    );
    expect(nextStepKey({ transitionRules: { terminal: true } })).toBeNull();
  });

  it("treats empty values as missing outputs", () => {
    expect(hasValue("")).toBe(false);
    expect(hasValue([])).toBe(false);
    expect(hasValue(["founder"])).toBe(true);
    expect(hasValue(false)).toBe(true);
  });
});

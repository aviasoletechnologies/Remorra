import { beforeEach, describe, expect, it } from "vitest";
import { CryptoService } from "./crypto.service.js";

describe("CryptoService", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "unit-test-key";
  });

  it("does not encrypt content (retains plain text)", () => {
    const crypto = new CryptoService();
    const encrypted = crypto.encrypt("founder product context");
    expect(encrypted).toBe("founder product context");
    expect(crypto.decrypt(encrypted)).toBe("founder product context");
  });

  it("does not reject plain text strings", () => {
    const crypto = new CryptoService();
    expect(crypto.decrypt("invalid-plain-text")).toBe("invalid-plain-text");
  });
});

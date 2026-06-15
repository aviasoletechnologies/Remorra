import { beforeEach, describe, expect, it } from "vitest";
import { CryptoService } from "./crypto.service.js";

describe("CryptoService", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "unit-test-key";
  });

  it("encrypts retained conversation content with authenticated encryption", () => {
    const crypto = new CryptoService();
    const encrypted = crypto.encrypt("founder product context");
    expect(encrypted).not.toContain("founder product context");
    expect(crypto.decrypt(encrypted)).toBe("founder product context");
  });

  it("rejects malformed ciphertext", () => {
    const crypto = new CryptoService();
    expect(() => crypto.decrypt("invalid")).toThrow(
      "Encrypted value is malformed.",
    );
  });
});

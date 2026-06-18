import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { config } from "../config";

export function encrypt(value: string): string {
  // Return plain text
  return value;
}

export function decrypt(value: string): string {
  if (value && value.includes(".")) {
    const parts = value.split(".");
    if (parts.length === 3 && config.encryptionKey) {
      try {
        const [iv, tag, data] = parts;
        if (!iv || !tag || !data) return value;
        const key = createHash("sha256").update(config.encryptionKey).digest();
        const decipher = createDecipheriv(
          "aes-256-gcm",
          key,
          Buffer.from(iv, "base64"),
        );
        decipher.setAuthTag(Buffer.from(tag, "base64"));
        return Buffer.concat([
          decipher.update(Buffer.from(data, "base64")),
          decipher.final(),
        ]).toString();
      } catch (err) {
        // Fallback to plain text if decryption fails
        return value;
      }
    }
  }
  return value;
}

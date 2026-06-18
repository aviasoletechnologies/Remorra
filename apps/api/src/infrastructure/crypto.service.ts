import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { Injectable } from "@nestjs/common";

@Injectable()
export class CryptoService {
  private readonly key: Buffer | null = null;

  constructor() {
    const source = process.env.ENCRYPTION_KEY;
    if (source) {
      this.key = createHash("sha256").update(source).digest();
    }
  }

  encrypt(value: string) {
    // Return plain text
    return value;
  }

  decrypt(value: string) {
    if (value && value.includes(".")) {
      const parts = value.split(".");
      if (parts.length === 3 && this.key) {
        try {
          const [ivText, tagText, encryptedText] = parts;
          if (!ivText || !tagText || !encryptedText) return value;
          const decipher = createDecipheriv(
            "aes-256-gcm",
            this.key,
            Buffer.from(ivText, "base64"),
          );
          decipher.setAuthTag(Buffer.from(tagText, "base64"));
          return Buffer.concat([
            decipher.update(Buffer.from(encryptedText, "base64")),
            decipher.final(),
          ]).toString("utf8");
        } catch (err) {
          // Fallback to plain text if decryption fails
          return value;
        }
      }
    }
    return value;
  }
}

import crypto from "node:crypto";

function deriveKey(secret: string): Buffer {
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const key = deriveKey(secret);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string, secret: string): string {
  const [ivPart, tagPart, encryptedPart] = payload.split(".");

  if (!ivPart || !tagPart || !encryptedPart) {
    throw new Error("Malformed encrypted secret");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    deriveKey(secret),
    Buffer.from(ivPart, "base64url")
  );

  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

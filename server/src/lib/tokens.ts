import crypto from "node:crypto";

export function generateOpaqueToken(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
}

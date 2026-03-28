import { prisma } from "../lib/prisma.js";
import type { ServerEnv } from "../lib/env.js";
import { decryptSecret, encryptSecret } from "../lib/encryption.js";
import { generateOpaqueToken } from "../lib/tokens.js";

const SETTINGS_ID = "main";

export async function ensureAppSettings(env: ServerEnv): Promise<void> {
  const settings = await prisma.appSetting.findUnique({
    where: {
      id: SETTINGS_ID,
    },
  });

  if (settings) {
    return;
  }

  await prisma.appSetting.create({
    data: {
      id: SETTINGS_ID,
      enrollmentTokenEncrypted: encryptSecret(generateOpaqueToken("pulseops_enroll"), env.encryptionKey),
    },
  });
}

export async function getEnrollmentToken(env: ServerEnv): Promise<string> {
  const settings = await prisma.appSetting.findUniqueOrThrow({
    where: {
      id: SETTINGS_ID,
    },
  });

  return decryptSecret(settings.enrollmentTokenEncrypted, env.encryptionKey);
}

export async function rotateEnrollmentToken(env: ServerEnv): Promise<string> {
  const nextToken = generateOpaqueToken("pulseops_enroll");

  await prisma.appSetting.upsert({
    where: {
      id: SETTINGS_ID,
    },
    update: {
      enrollmentTokenEncrypted: encryptSecret(nextToken, env.encryptionKey),
    },
    create: {
      id: SETTINGS_ID,
      enrollmentTokenEncrypted: encryptSecret(nextToken, env.encryptionKey),
    },
  });

  return nextToken;
}

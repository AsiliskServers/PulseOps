import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { agentDistDir } from "../lib/paths.js";

type AgentReleaseManifest = {
  version: string;
  assets: Record<string, string>;
  checksums: Record<string, string>;
};

let cachedManifest: AgentReleaseManifest | null = null;
let cachedMtimeMs = -1;

export async function getLatestAgentVersion(): Promise<string | null> {
  const manifest = await getLatestAgentReleaseManifest();
  return manifest?.version ?? null;
}

export function resolveAgentUpdateStatus(
  currentVersion: string | null | undefined,
  latestVersion: string | null | undefined
): "up_to_date" | "update_available" | "unknown" {
  if (!currentVersion || !latestVersion) {
    return "unknown";
  }

  return compareVersions(currentVersion, latestVersion) >= 0 ? "up_to_date" : "update_available";
}

async function getLatestAgentReleaseManifest(): Promise<AgentReleaseManifest | null> {
  const manifestPath = path.join(agentDistDir, "latest.json");

  try {
    const fileStat = await stat(manifestPath);
    if (cachedManifest && cachedMtimeMs === fileStat.mtimeMs) {
      return cachedManifest;
    }

    const content = await readFile(manifestPath, "utf8");
    const parsed = JSON.parse(content) as Partial<AgentReleaseManifest>;

    if (
      !parsed.version ||
      !parsed.assets ||
      typeof parsed.assets !== "object" ||
      !parsed.checksums ||
      typeof parsed.checksums !== "object"
    ) {
      cachedManifest = null;
      cachedMtimeMs = fileStat.mtimeMs;
      return null;
    }

    cachedManifest = {
      version: parsed.version,
      assets: parsed.assets as Record<string, string>,
      checksums: parsed.checksums as Record<string, string>,
    };
    cachedMtimeMs = fileStat.mtimeMs;

    return cachedManifest;
  } catch {
    cachedManifest = null;
    cachedMtimeMs = -1;
    return null;
  }
}

function compareVersions(current: string, latest: string): number {
  const currentValue = current.trim();
  const latestValue = latest.trim();

  if (currentValue === latestValue) {
    return 0;
  }

  const currentBuild = parseBuildVersion(currentValue);
  const latestBuild = parseBuildVersion(latestValue);
  if (currentBuild && latestBuild) {
    if (currentBuild.timestamp !== latestBuild.timestamp) {
      return currentBuild.timestamp - latestBuild.timestamp;
    }

    return currentValue.localeCompare(latestValue);
  }

  const currentSemver = parseSemver(currentValue);
  const latestSemver = parseSemver(latestValue);
  if (currentSemver && latestSemver) {
    const length = Math.max(currentSemver.length, latestSemver.length);

    for (let index = 0; index < length; index++) {
      const currentPart = currentSemver[index] ?? 0;
      const latestPart = latestSemver[index] ?? 0;

      if (currentPart !== latestPart) {
        return currentPart - latestPart;
      }
    }

    return 0;
  }

  return currentValue.localeCompare(latestValue);
}

function parseBuildVersion(value: string): { timestamp: number } | null {
  const match = value.match(/^(\d+)-[A-Za-z0-9]+$/);
  if (!match) {
    return null;
  }

  return {
    timestamp: Number(match[1]),
  };
}

function parseSemver(value: string): number[] | null {
  const normalized = value.replace(/^v/, "");
  const parts = normalized.split(".");

  if (parts.length === 0) {
    return null;
  }

  const result: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      return null;
    }
    result.push(Number(part));
  }

  return result;
}

import { access } from "node:fs/promises";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_CHARS = 4000;

export type AgentSummary = {
  reachable: boolean;
  upgradableCount: number;
  securityCount: number;
  rebootRequired: boolean;
  checkedAt: string;
  outputPreview: string;
};

export class AgentExecutionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "AgentExecutionError";
    this.statusCode = statusCode;
  }
}

function trimOutput(output: string): string {
  const clean = output.trim();
  return clean.length > MAX_OUTPUT_CHARS ? clean.slice(-MAX_OUTPUT_CHARS) : clean;
}

async function runAptCommand(command: string, args: string[]): Promise<string> {
  const result = await execFileAsync(command, args, {
    env: {
      ...process.env,
      DEBIAN_FRONTEND: "noninteractive",
    },
    maxBuffer: 10 * 1024 * 1024,
  });

  return `${result.stdout}\n${result.stderr}`.trim();
}

async function getUpgradableSummary(): Promise<{
  upgradableCount: number;
  securityCount: number;
  rawList: string;
}> {
  const rawList = await runAptCommand("apt", ["list", "--upgradable"]);
  const lines = rawList
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("Listing..."));

  const securityCount = lines.filter((line) => /\/[^ ]*security[^ ]*\s/i.test(line)).length;

  return {
    upgradableCount: lines.length,
    securityCount,
    rawList,
  };
}

async function detectRebootRequired(): Promise<boolean> {
  try {
    await access("/var/run/reboot-required");
    return true;
  } catch {
    return false;
  }
}

function formatSummary(updateOutput: string, listOutput: string, upgradeOutput?: string): string {
  return trimOutput([updateOutput, upgradeOutput, listOutput].filter(Boolean).join("\n\n"));
}

export async function runRefresh(): Promise<AgentSummary> {
  const updateOutput = await runAptCommand("apt-get", ["update"]);
  const packageSummary = await getUpgradableSummary();
  const rebootRequired = await detectRebootRequired();

  return {
    reachable: true,
    upgradableCount: packageSummary.upgradableCount,
    securityCount: packageSummary.securityCount,
    rebootRequired,
    checkedAt: new Date().toISOString(),
    outputPreview: formatSummary(updateOutput, packageSummary.rawList),
  };
}

export async function runUpgrade(allowUpgrade: boolean): Promise<AgentSummary> {
  if (!allowUpgrade) {
    throw new AgentExecutionError("Upgrade is disabled on this agent", 403);
  }

  const updateOutput = await runAptCommand("apt-get", ["update"]);
  const upgradeOutput = await runAptCommand("apt-get", ["upgrade", "-y"]);
  const packageSummary = await getUpgradableSummary();
  const rebootRequired = await detectRebootRequired();

  return {
    reachable: true,
    upgradableCount: packageSummary.upgradableCount,
    securityCount: packageSummary.securityCount,
    rebootRequired,
    checkedAt: new Date().toISOString(),
    outputPreview: formatSummary(updateOutput, packageSummary.rawList, upgradeOutput),
  };
}

import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type { ServerEnv } from "../lib/env.js";
import { serverAssetsDir, serverSrcAssetsDir } from "../lib/paths.js";

async function resolveInstallScriptPath(): Promise<string> {
  const candidates = [
    path.join(serverAssetsDir, "install-agent.sh"),
    path.join(serverSrcAssetsDir, "install-agent.sh"),
  ];

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("install-agent.sh template not found");
}

export async function buildInstallScript(env: ServerEnv): Promise<string> {
  const templatePath = await resolveInstallScriptPath();
  const template = await readFile(templatePath, "utf8");

  return template
    .replaceAll("__DEFAULT_SERVER_URL__", env.appPublicUrl)
    .replaceAll("__DEFAULT_REPORT_INTERVAL__", String(env.agentReportIntervalSeconds))
    .replaceAll("__DEFAULT_POLL_INTERVAL__", String(env.agentJobPollIntervalSeconds))
    .replaceAll(
      "__DEFAULT_AUTO_UPDATE_INTERVAL__",
      String(env.agentAutoUpdateIntervalSeconds)
    );
}

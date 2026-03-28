import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ServerEnv } from "../lib/env.js";
import { serverAssetsDir } from "../lib/paths.js";

export async function buildInstallScript(env: ServerEnv): Promise<string> {
  const templatePath = path.join(serverAssetsDir, "install-agent.sh");
  const template = await readFile(templatePath, "utf8");

  return template
    .replaceAll("__DEFAULT_SERVER_URL__", env.appPublicUrl)
    .replaceAll("__DEFAULT_REPORT_INTERVAL__", String(env.agentReportIntervalSeconds))
    .replaceAll("__DEFAULT_POLL_INTERVAL__", String(env.agentJobPollIntervalSeconds));
}

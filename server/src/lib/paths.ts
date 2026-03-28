import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

export const serverRoot = path.resolve(currentDir, "..", "..");
export const repoRoot = path.resolve(serverRoot, "..");
export const agentDistDir = path.resolve(repoRoot, "agent", "dist");
export const serverAssetsDir = path.resolve(serverRoot, "assets");

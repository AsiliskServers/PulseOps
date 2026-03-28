export type EnvironmentValue = "production" | "staging" | "internal" | "other";
export type JobType = "refresh" | "upgrade";

const ENVIRONMENTS = new Set<EnvironmentValue>(["production", "staging", "internal", "other"]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRequiredString(
  input: Record<string, unknown>,
  key: string,
  label: string
): string {
  const value = input[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }

  return value.trim();
}

export function readOptionalString(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readOptionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  return typeof value === "boolean" ? value : undefined;
}

export function validateEnvironment(value: string): EnvironmentValue {
  if (!ENVIRONMENTS.has(value as EnvironmentValue)) {
    throw new Error("environment must be one of production, staging, internal or other");
  }

  return value as EnvironmentValue;
}

export function validateUrl(value: string): string {
  const parsed = new URL(value);
  return parsed.toString().replace(/\/$/, "");
}

export function normalizeJobType(value: string): JobType {
  if (value !== "refresh" && value !== "upgrade") {
    throw new Error("Invalid job type");
  }

  return value;
}

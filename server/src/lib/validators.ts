export type EnvironmentValue = "production" | "staging" | "internal" | "other";
export type JobType = "refresh" | "upgrade" | "agent_update";

const ENVIRONMENTS = new Set<EnvironmentValue>(["production", "staging", "internal", "other"]);
const DEFAULT_MAX_STRING_LENGTH = 10_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readRequiredString(
  input: Record<string, unknown>,
  key: string,
  label: string,
  options: { maxLength?: number } = {}
): string {
  const value = input[key];

  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }

  const trimmed = value.trim();
  const maxLength = options.maxLength ?? DEFAULT_MAX_STRING_LENGTH;

  if (trimmed.length === 0) {
    throw new Error(`${label} is required`);
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or less`);
  }

  return trimmed;
}

export function readOptionalString(
  input: Record<string, unknown>,
  key: string,
  options: { maxLength?: number } = {}
): string | undefined {
  const value = input[key];

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  const maxLength = options.maxLength ?? DEFAULT_MAX_STRING_LENGTH;

  if (trimmed.length > maxLength) {
    throw new Error(`${key} must be ${maxLength} characters or less`);
  }

  return trimmed.length > 0 ? trimmed : undefined;
}

export function readOptionalBoolean(input: Record<string, unknown>, key: string): boolean | undefined {
  const value = input[key];
  return typeof value === "boolean" ? value : undefined;
}

export function readOptionalInteger(
  input: Record<string, unknown>,
  key: string,
  options: { min?: number; max?: number } = {}
): number | undefined {
  const value = input[key];

  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value.trim(), 10)
        : Number.NaN;

  if (!Number.isInteger(numericValue)) {
    throw new Error(`${key} must be an integer`);
  }

  if (options.min !== undefined && numericValue < options.min) {
    throw new Error(`${key} must be greater than or equal to ${options.min}`);
  }

  if (options.max !== undefined && numericValue > options.max) {
    throw new Error(`${key} must be lower than or equal to ${options.max}`);
  }

  return numericValue;
}

export function validateEnvironment(value: string): EnvironmentValue {
  if (!ENVIRONMENTS.has(value as EnvironmentValue)) {
    throw new Error("environment must be one of production, staging, internal or other");
  }

  return value as EnvironmentValue;
}

export function normalizeJobType(value: string): JobType {
  if (value !== "refresh" && value !== "upgrade" && value !== "agent_update") {
    throw new Error("Invalid job type");
  }

  return value;
}

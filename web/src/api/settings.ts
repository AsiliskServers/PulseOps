import { fetchJson } from "./client";
import type { EnrollmentSettings } from "../types";

export async function getEnrollmentSettings(): Promise<EnrollmentSettings> {
  return fetchJson<EnrollmentSettings>("/settings/enrollment");
}

export async function rotateEnrollmentSettings(): Promise<EnrollmentSettings> {
  return fetchJson<EnrollmentSettings>("/settings/enrollment/rotate", {
    method: "POST",
  });
}

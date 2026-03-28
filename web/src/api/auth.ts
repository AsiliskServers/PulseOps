import { fetchJson } from "./client";
import type { User } from "../types";

export async function getMe(): Promise<User> {
  const payload = await fetchJson<{ user: User }>("/auth/me");
  return payload.user;
}

export async function login(email: string, password: string): Promise<User> {
  const payload = await fetchJson<{ user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

  return payload.user;
}

export async function logout(): Promise<void> {
  await fetchJson<void>("/auth/logout", {
    method: "POST",
  });
}

import { fetchJson } from "./client";
import type { CategorySummary } from "../types";

export async function listCategories(): Promise<CategorySummary[]> {
  const payload = await fetchJson<{ categories: CategorySummary[] }>("/categories");
  return payload.categories;
}

export async function createCategory(name: string): Promise<CategorySummary> {
  const payload = await fetchJson<{ category: CategorySummary }>("/categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  return payload.category;
}

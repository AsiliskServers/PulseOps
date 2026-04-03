import { ApiError, fetchJson } from "./client";
import type { CategorySummary } from "../types";

export async function listCategories(): Promise<CategorySummary[]> {
  try {
    const payload = await fetchJson<{ categories: CategorySummary[] }>("/categories");
    return payload.categories;
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) {
      return [];
    }

    throw error;
  }
}

export async function createCategory(name: string): Promise<CategorySummary> {
  const payload = await fetchJson<{ category: CategorySummary }>("/categories", {
    method: "POST",
    body: JSON.stringify({ name }),
  });

  return payload.category;
}

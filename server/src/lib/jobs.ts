export const pendingJobStatuses = ["queued", "claimed", "running"] as const;

export function isPendingJobStatus(status: string): boolean {
  return pendingJobStatuses.includes(status as (typeof pendingJobStatuses)[number]);
}

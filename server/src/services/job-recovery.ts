import { prisma } from "../lib/prisma.js";

const INTERRUPTED_JOB_STATUSES = ["claimed", "running"] as const;
const INTERRUPTED_JOB_MESSAGE =
  "Job interrompu automatiquement : le serveur principal PulseOps a redémarré.";

export async function interruptInFlightJobsOnStartup() {
  const now = new Date();

  const result = await prisma.job.updateMany({
    where: {
      status: {
        in: [...INTERRUPTED_JOB_STATUSES],
      },
    },
    data: {
      status: "failed",
      finishedAt: now,
      errorMessage: INTERRUPTED_JOB_MESSAGE,
    },
  });

  return {
    interruptedCount: result.count,
    message: INTERRUPTED_JOB_MESSAGE,
  };
}

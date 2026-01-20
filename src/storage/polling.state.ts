import prisma from "../lib/prisma";

export async function getPollingState(source: string) {
  return prisma.pollingState.findUnique({
    where: { source },
  });
}

export async function updatePollingState(
  source: string,
  last_event_time: Date,
) {
  return prisma.pollingState.update({
    where: { source },
    data: { last_event_time },
  });
}

/**
 * Get or create polling state with a default minimal timestamp
 */
export async function ensurePollingState(source: string) {
  const existing = await getPollingState(source);
  if (existing) return existing;

  // default start time far in the past
  const defaultTime = new Date("2000-01-01T00:00:00Z");
  return prisma.pollingState.create({
    data: {
      source,
      last_event_time: defaultTime,
    },
  });
}

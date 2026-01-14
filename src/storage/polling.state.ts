import prisma from "../lib/prisma";

export async function getPollingState(source: string) {
  return prisma.pollingState.findUnique({
    where: { source },
  });
}

export async function updatePollingState(
  source: string,
  last_event_time: Date
) {
  return prisma.pollingState.update({
    where: { source },
    data: { last_event_time },
  });
}

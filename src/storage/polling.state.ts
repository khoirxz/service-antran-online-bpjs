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

  // default awal waktu pengambilan data
  const defaultTime = new Date("2026-01-10T00:00:00Z");
  return prisma.pollingState.create({
    data: {
      source,
      last_event_time: defaultTime,
    },
  });
}
/**
 * Get polling state and extract batch cursor info
 * Returns last cursor untuk fetch next batch
 */
export async function getPollingStateBatchCursor(source: string) {
  const state = await ensurePollingState(source);

  // Use pending_cursor jika ada (batch sedang diproses), else use last_event_time
  const cursor =
    state.pending_cursor ||
    state.last_event_time.toISOString().replace("T", " ").substring(0, 19);

  return {
    cursor,
    batchCount: state.batch_count || 0,
    isPending: !!state.pending_cursor,
  };
}

/**
 * Update batch cursor saat sedang memproses batch
 * pending_cursor diset untuk track batch yg sedang diproses
 */
export async function updateBatchCursor(source: string, newCursor: string) {
  await prisma.pollingState.update({
    where: { source },
    data: {
      pending_cursor: newCursor,
      batch_count: {
        increment: 1,
      },
    },
  });
}

/**
 * Commit batch cursor setelah batch berhasil diproses
 * Pindahkan pending_cursor ke last_event_time & clear pending_cursor
 */
export async function commitBatchCursor(source: string) {
  const state = await getPollingState(source);

  if (!state) return;

  // Convert pending_cursor string ke datetime
  let newEventTime = state.last_event_time;
  if (state.pending_cursor) {
    // pending_cursor format: "YYYY-MM-DD HH:MM:SS"
    newEventTime = new Date(state.pending_cursor.replace(" ", "T") + "Z");
  }

  await prisma.pollingState.update({
    where: { source },
    data: {
      last_event_time: newEventTime,
      pending_cursor: null,
    },
  });
}

/**
 * Rollback batch cursor jika ada error
 * Clear pending_cursor tanpa update last_event_time
 */
export async function rollbackBatchCursor(source: string) {
  await prisma.pollingState.update({
    where: { source },
    data: {
      pending_cursor: null,
    },
  });
}

import prisma from "../src/lib/prisma";

async function resetTaskPollingStates() {
  // Reset cursor untuk task pollers (CHECKIN, START, FINISH, PHARMACY_STARTED, CLOSE)
  // ke waktu yang sesuai agar bisa memproses data yang ada

  const taskSources = [
    "CHECKIN",
    "START",
    "FINISH",
    "PHARMACY_STARTED",
    "CLOSE",
  ];
  // Set cursor ke 2026-01-22 00:00:00 UTC agar memproses data dari kemarin
  const resetTime = new Date("2026-01-22T00:00:00Z");

  for (const source of taskSources) {
    const existing = await prisma.pollingState.findUnique({
      where: { source },
    });

    if (existing) {
      await prisma.pollingState.update({
        where: { source },
        data: {
          last_event_time: resetTime,
          pending_cursor: null, // Clear pending cursor
          batch_count: 0,
        },
      });
      console.log(
        `✅ Reset ${source}: cursor set to ${resetTime.toISOString()}`,
      );
    } else {
      console.log(`⏭️  ${source} tidak ditemukan`);
    }
  }

  // Verify
  console.log("\n=== Polling State setelah reset ===");
  const states = await prisma.pollingState.findMany();
  for (const state of states) {
    console.log({
      source: state.source,
      last_event_time: state.last_event_time.toISOString(),
      pending_cursor: state.pending_cursor,
    });
  }

  await prisma.$disconnect();
}

resetTaskPollingStates().catch((e) => {
  console.error(e);
  process.exit(1);
});

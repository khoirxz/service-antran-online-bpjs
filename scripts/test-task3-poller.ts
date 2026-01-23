import { pollTaskId3Event } from "../src/poller/task3.poller";
import prisma from "../src/lib/prisma";

async function testTask3Poller() {
  console.log("=== Test Task3 (CHECKIN) Poller ===\n");

  // Cek state sebelum
  console.log("Polling state sebelum:");
  const stateBefore = await prisma.pollingState.findUnique({
    where: { source: "CHECKIN" },
  });
  console.log(stateBefore);

  console.log("\n--- Menjalankan pollTaskId3Event ---\n");
  await pollTaskId3Event();

  // Cek state sesudah
  console.log("\nPolling state sesudah:");
  const stateAfter = await prisma.pollingState.findUnique({
    where: { source: "CHECKIN" },
  });
  console.log(stateAfter);

  // Cek VisitEvent yang sudah diupdate
  console.log("\n=== VisitEvent dengan task_progress yang ada task 3 ===");
  const events = await prisma.visitEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  for (const event of events) {
    const tp = event.task_progress as any;
    if (tp && tp["3"]) {
      console.log({
        visit_id: event.visit_id,
        task_progress: tp,
      });
    }
  }

  await prisma.$disconnect();
}

testTask3Poller().catch((e) => {
  console.error(e);
  process.exit(1);
});

import prisma from "../src/lib/prisma";
import { buildQueue } from "../src/queue/queue.builder";

async function testQueueBuilder() {
  console.log("=== Cek VisitEvent dengan task_progress 3 yang DRAFT ===\n");

  const events = await prisma.visitEvent.findMany({
    where: { is_jkn: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  for (const event of events) {
    const tp = event.task_progress as any;
    console.log({
      visit_id: event.visit_id,
      task1_status: tp?.["1"]?.status,
      task3_status: tp?.["3"]?.status,
      task3_event_time: tp?.["3"]?.event_time,
    });
  }

  console.log("\n=== Cek Queue yang sudah ada untuk task 3 ===\n");
  const queues = await prisma.bpjsAntreanQueue.findMany({
    where: { task_id: 3 },
    take: 10,
  });
  console.log(`Ada ${queues.length} queue untuk task 3`);
  for (const q of queues) {
    console.log({
      visit_id: q.visit_id,
      task_id: q.task_id,
      status: q.status,
      payload: q.payload,
    });
  }

  console.log("\n=== Jalankan Queue Builder ===\n");
  await buildQueue();

  console.log("\n=== Cek Queue task 3 setelah build ===\n");
  const queuesAfter = await prisma.bpjsAntreanQueue.findMany({
    where: { task_id: 3 },
    take: 10,
  });
  console.log(`Ada ${queuesAfter.length} queue untuk task 3`);
  for (const q of queuesAfter) {
    console.log({
      visit_id: q.visit_id,
      task_id: q.task_id,
      status: q.status,
      payload: q.payload,
    });
  }

  await prisma.$disconnect();
}

testQueueBuilder().catch((e) => {
  console.error(e);
  process.exit(1);
});

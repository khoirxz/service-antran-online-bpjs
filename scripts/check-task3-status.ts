import prisma from "../src/lib/prisma";

async function checkTask3Status() {
  // Cek queue task 3 yang sudah SEND
  const queues = await prisma.bpjsAntreanQueue.findMany({
    where: { task_id: 3 },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  console.log("=== Queue Task 3 ===");
  for (const q of queues) {
    console.log({
      visit_id: q.visit_id,
      status: q.status,
      error: q.last_error,
      payload: q.payload,
      updated: q.updatedAt?.toISOString(),
    });
  }

  // Cek VisitEvent untuk melihat task_progress yang sudah SENT_BPJS
  console.log("\n=== VisitEvent dengan task3 status ===");
  const events = await prisma.visitEvent.findMany({
    where: { is_jkn: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  for (const event of events) {
    const tp = event.task_progress as any;
    if (tp?.["3"]) {
      console.log({
        visit_id: event.visit_id,
        task3: tp["3"],
      });
    }
  }

  await prisma.$disconnect();
}

checkTask3Status().catch((e) => {
  console.error(e);
  process.exit(1);
});

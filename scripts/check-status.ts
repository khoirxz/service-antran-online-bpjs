import prisma from "../src/lib/prisma";

async function check() {
  const visitEvents = await prisma.visitEvent.count();
  const queuePending = await prisma.bpjsAntreanQueue.count({
    where: { status: "PENDING" },
  });
  const queueSend = await prisma.bpjsAntreanQueue.count({
    where: { status: "SEND" },
  });
  const queueFailed = await prisma.bpjsAntreanQueue.count({
    where: { status: "FAILED" },
  });

  console.log("📊 Database Status:");
  console.log("   VisitEvent total:", visitEvents);
  console.log("   Queue PENDING:", queuePending);
  console.log("   Queue SEND:", queueSend);
  console.log("   Queue FAILED:", queueFailed);

  // Cek beberapa sample VisitEvent
  const samples = await prisma.visitEvent.findMany({
    take: 5,
    orderBy: { createdAt: "desc" },
    select: {
      visit_id: true,
      is_jkn: true,
      task_progress: true,
    },
  });

  console.log("\n📝 Sample VisitEvents (terbaru):");
  samples.forEach((s) => {
    const progress = s.task_progress as any;
    const status1 = progress?.["1"]?.status || "N/A";
    console.log("   ", s.visit_id, "- JKN:", s.is_jkn, "- Task1:", status1);
  });

  // Cek VisitEvent dengan status READY_BPJS yang belum di-queue
  const readyNotQueued = (await prisma.$queryRaw`
    SELECT v.visit_id, v.task_progress
    FROM VisitEvent v
    WHERE v.is_jkn = true
    AND JSON_EXTRACT(v.task_progress, '$."1".status') = 'READY_BPJS'
    AND NOT EXISTS (
      SELECT 1 FROM BpjsAntreanQueue q 
      WHERE q.visit_id = v.visit_id AND q.task_id = 1
    )
    LIMIT 5
  `) as any[];

  console.log("\n⚠️  READY_BPJS tapi belum di-queue:", readyNotQueued.length);

  await prisma.$disconnect();
}

check().catch(console.error);

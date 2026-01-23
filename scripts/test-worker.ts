import prisma from "../src/lib/prisma";
import { processQueueJob } from "../src/queue/queue.worker";

async function run() {
  console.log("🚀 Testing Queue Worker - Processing 5 jobs...\n");

  for (let i = 0; i < 5; i++) {
    await processQueueJob();
    // Delay 1 detik antar job
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Cek hasil
  const pending = await prisma.bpjsAntreanQueue.count({
    where: { status: "PENDING" },
  });
  const sent = await prisma.bpjsAntreanQueue.count({
    where: { status: "SEND" },
  });
  const failed = await prisma.bpjsAntreanQueue.count({
    where: { status: "FAILED" },
  });

  console.log("\n📊 Status Queue:");
  console.log(`   PENDING: ${pending}`);
  console.log(`   SEND: ${sent}`);
  console.log(`   FAILED: ${failed}`);

  // Lihat sample yang SEND atau FAILED
  const samples = await prisma.bpjsAntreanQueue.findMany({
    where: { status: { in: ["SEND", "FAILED"] } },
    take: 5,
    orderBy: { updatedAt: "desc" },
    select: {
      visit_id: true,
      status: true,
      last_error: true,
    },
  });

  if (samples.length > 0) {
    console.log("\n📝 Sample hasil:");
    samples.forEach((s) => {
      console.log(
        `   ${s.visit_id} - ${s.status}${s.last_error ? `: ${s.last_error}` : ""}`,
      );
    });
  }

  await prisma.$disconnect();
  console.log("\n✅ Done!");
}

run().catch(console.error);

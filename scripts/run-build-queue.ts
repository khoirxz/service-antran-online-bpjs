import { buildQueue } from "../src/queue/queue.builder";
import prisma from "../src/lib/prisma";

async function run() {
  console.log("🚀 Running buildQueue manually...");
  await buildQueue();

  // Cek hasil
  const queuePending = await prisma.bpjsAntreanQueue.count({
    where: { status: "PENDING" },
  });
  console.log("📊 Queue PENDING:", queuePending);

  await prisma.$disconnect();
  console.log("✅ Done!");
}

run().catch((e) => {
  console.error("❌ Error:", e);
  process.exit(1);
});

import prisma from "../src/lib/prisma";
import { buildQueue } from "../src/queue/queue.builder";

async function run() {
  console.log("🔧 Testing queue untuk tanggal 22 Jan 2026...\n");

  // Hapus queue lama semua
  await prisma.bpjsAntreanQueue.deleteMany({
    where: { status: "PENDING" },
  });
  console.log("🗑️ Semua queue PENDING dihapus");

  // Jalankan buildQueue
  console.log("\n🔄 Running buildQueue...\n");
  await buildQueue();

  // Cek hasil - fokus pada tanggal 22 Jan
  const queues = await prisma.bpjsAntreanQueue.findMany({
    where: { status: "PENDING", task_id: 1 },
    take: 10,
    orderBy: { createdAt: "desc" },
    select: {
      visit_id: true,
      payload: true,
    },
  });

  console.log("\n📝 Queue baru (10 terbaru):");
  for (const q of queues) {
    const p = q.payload as any;
    const tanggal = p?.tanggalperiksa || "N/A";
    const jampraktek = p?.jampraktek || "(kosong)";
    const kuota = p?.kuotajkn || 0;
    console.log(
      `   ${q.visit_id} | ${tanggal} | jam: ${jampraktek} | kuota: ${kuota}`,
    );
  }

  // Summary
  const totalPending = await prisma.bpjsAntreanQueue.count({
    where: { status: "PENDING" },
  });
  const withJam = (await prisma.$queryRaw`
    SELECT COUNT(*) as cnt FROM BpjsAntreanQueue 
    WHERE status = 'PENDING' 
    AND JSON_EXTRACT(payload, '$.jampraktek') IS NOT NULL 
    AND JSON_EXTRACT(payload, '$.jampraktek') != ''
  `) as any[];

  console.log(`\n📊 Summary:`);
  console.log(`   Total PENDING: ${totalPending}`);
  console.log(`   Dengan jampraktek: ${withJam[0]?.cnt || 0}`);

  await prisma.$disconnect();
}

run().catch(console.error);

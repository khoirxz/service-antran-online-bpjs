/**
 * Script untuk reset dan rebuild queue
 * 1. Hapus queue PENDING dengan jam_praktek kosong
 * 2. Test buildQueue ulang
 */

import prisma from "../src/lib/prisma";
import { buildQueue } from "../src/queue/queue.builder";

async function run() {
  console.log("🔧 Resetting invalid queue entries...\n");

  // 1. Cari queue dengan payload yang jam_praktek kosong
  const invalidQueues = await prisma.bpjsAntreanQueue.findMany({
    where: {
      status: "PENDING",
      task_id: 1, // Hanya REGISTER
    },
    select: {
      id: true,
      visit_id: true,
      payload: true,
    },
  });

  let invalidCount = 0;
  for (const q of invalidQueues) {
    const payload = q.payload as any;
    if (!payload?.jampraktek || payload.jampraktek === "") {
      invalidCount++;
      console.log(`   ❌ ${q.visit_id} - jampraktek kosong`);
    }
  }

  console.log(
    `\n📊 Queue dengan jampraktek kosong: ${invalidCount}/${invalidQueues.length}`,
  );

  if (invalidCount > 0) {
    console.log("\n🗑️  Menghapus queue invalid...");

    // Hapus queue invalid
    for (const q of invalidQueues) {
      const payload = q.payload as any;
      if (!payload?.jampraktek || payload.jampraktek === "") {
        await prisma.bpjsAntreanQueue.delete({
          where: { id: q.id },
        });
      }
    }

    console.log("✅ Queue invalid dihapus");
  }

  // 2. Cek status sekarang
  const remainingQueue = await prisma.bpjsAntreanQueue.count({
    where: { status: "PENDING" },
  });
  console.log(`\n📊 Queue PENDING tersisa: ${remainingQueue}`);

  // 3. Jalankan buildQueue untuk rebuild
  console.log("\n🔄 Running buildQueue...\n");
  await buildQueue();

  // 4. Cek hasil
  const newQueue = await prisma.bpjsAntreanQueue.count({
    where: { status: "PENDING" },
  });
  console.log(`\n📊 Queue PENDING setelah rebuild: ${newQueue}`);

  // 5. Sample payload baru
  const samples = await prisma.bpjsAntreanQueue.findMany({
    where: { status: "PENDING", task_id: 1 },
    take: 3,
    select: {
      visit_id: true,
      payload: true,
    },
  });

  console.log("\n📝 Sample payload baru:");
  for (const s of samples) {
    const p = s.payload as any;
    console.log(
      `   ${s.visit_id}: jampraktek="${p?.jampraktek}", kuota_jkn=${p?.kuotajkn}`,
    );
  }

  await prisma.$disconnect();
  console.log("\n✅ Done!");
}

run().catch(console.error);

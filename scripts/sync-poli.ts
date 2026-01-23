import { manualSyncPoli } from "../src/scheduler/poli.scheduler";
import prisma from "../src/lib/prisma";

async function run() {
  console.log("🔄 Syncing Poli data from BPJS HFIS...");

  try {
    const result = await manualSyncPoli();
    console.log("✅ Sync result:", result);
  } catch (error: any) {
    console.error("❌ Error syncing:", error.message);
  }

  // Check hasil
  const poliCount = await prisma.poli.count();
  console.log("\n📊 Jumlah Poli setelah sync:", poliCount);

  const polis = await prisma.poli.findMany();
  console.log("\n📝 Semua Poli:");
  polis.forEach((p) => console.log("   ", p.poli_id, "-", p.nama));

  await prisma.$disconnect();
}

run();

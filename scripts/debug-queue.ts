import "dotenv/config";
import prisma from "../src/lib/prisma";
import { getTaskProgress } from "../src/domain/task.progress";

async function debugQueue() {
  console.log("=== DEBUG: Kenapa READY_BPJS tidak di-queue ===");

  // Cek VisitEvent hari ini dengan status READY_BPJS
  const todayEvents = await prisma.visitEvent.findMany({
    where: {
      tanggal: { gte: new Date("2026-01-24"), lt: new Date("2026-01-25") },
      is_jkn: true,
    },
    select: {
      visit_id: true,
      is_jkn: true,
      poli_id: true,
      task_progress: true,
    },
  });

  console.log(`\nDitemukan ${todayEvents.length} VisitEvent hari ini (JKN):`);

  for (const event of todayEvents) {
    const progress = getTaskProgress(event.task_progress);
    const registerStatus = progress["1"]?.status;

    console.log({
      visit_id: event.visit_id,
      poli_id: event.poli_id,
      is_jkn: event.is_jkn,
      task1_status: registerStatus,
      ready_bpjs: registerStatus === "READY_BPJS",
    });

    // Cek apakah sudah ada di queue
    if (registerStatus === "READY_BPJS") {
      const exists = await prisma.bpjsAntreanQueue.findUnique({
        where: {
          visit_id_task_id: { visit_id: event.visit_id, task_id: 1 },
        },
      });

      console.log(`  -> Queue exists: ${!!exists}`);
      if (exists) {
        console.log(`     Status: ${exists.status}`);
      }
    }
  }

  console.log("\n=== Cek 100 events untuk REGISTER queueing ===");
  const registerEvents = await prisma.visitEvent.findMany({
    where: { is_jkn: true },
    orderBy: { event_time: "asc" },
    take: 100,
    select: {
      visit_id: true,
      tanggal: true,
      poli_id: true,
      task_progress: true,
    },
  });

  let readyCount = 0;
  for (const event of registerEvents) {
    const progress = getTaskProgress(event.task_progress);
    const registerStatus = progress["1"]?.status;

    if (registerStatus === "READY_BPJS") {
      readyCount++;
      console.log(
        `${event.visit_id} - ${event.tanggal.toISOString().slice(0, 10)} - poli: ${event.poli_id}`,
      );
    }
  }

  console.log(`\nTotal READY_BPJS dalam 100 events: ${readyCount}`);

  await prisma.$disconnect();
}

debugQueue().catch(console.error);

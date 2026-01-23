/**
 * Diagnostic script untuk check status data
 *
 * Usage: npx ts-node scripts/diagnose.ts
 */

import prisma from "../src/lib/prisma";

async function diagnose() {
  console.log("🔍 Diagnosing data flow...\n");

  // 1. Check VisitEvent count
  const visitEventCount = await prisma.visitEvent.count();
  console.log(`📊 Total VisitEvent: ${visitEventCount}`);

  if (visitEventCount === 0) {
    console.log("   ⚠️  NO DATA IN VisitEvent! Check poller logs.");
    console.log("   - Are pollers running? Check app.ts startPollers()\n");
    return;
  }

  // 2. Check VisitEvent status breakdown
  const allEvents = await prisma.visitEvent.findMany({
    select: {
      visit_id: true,
      poli_id: true,
      dokter_id: true,
      task_progress: true,
      createdAt: true,
    },
  });

  const statusBreakdown: Record<string, number> = {};
  const nullPoliDokter: typeof allEvents = [];

  for (const event of allEvents) {
    const progress = (event.task_progress as any)?.["1"];
    const status = progress?.status || "NO_STATUS";
    statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;

    if (!event.poli_id || !event.dokter_id) {
      nullPoliDokter.push(event);
    }
  }

  console.log("\n📈 Task progress[1] Status breakdown:");
  Object.entries(statusBreakdown).forEach(([status, count]) => {
    const indicator =
      status === "READY_BPJS" ? "✅" : status === "BLOCKED_BPJS" ? "⚠️" : "❓";
    console.log(`   ${indicator} ${status}: ${count}`);
  });

  // 3. Check for NULL poli_id or dokter_id
  if (nullPoliDokter.length > 0) {
    console.log(
      `\n⚠️  Found ${nullPoliDokter.length} events with NULL poli_id or dokter_id:`,
    );
    nullPoliDokter.slice(0, 3).forEach((event) => {
      console.log(
        `   - ${event.visit_id}: poli_id=${event.poli_id}, dokter_id=${event.dokter_id}`,
      );
    });
    console.log(
      "   💡 This means Khanza JOIN failed! Check khanza.query.ts JOIN condition.",
    );
  }

  // 4. Check BpjsAntreanQueue
  console.log(
    `\n📦 BpjsAntreanQueue:${await prisma.bpjsAntreanQueue.count()} total`,
  );
  const queueStats = await prisma.bpjsAntreanQueue.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  queueStats.forEach((stat) => {
    console.log(`   - ${stat.status}: ${stat._count.id}`);
  });

  // 5. Check if any READY_BPJS events are queued
  const readyBpjsCount = Object.values(statusBreakdown).reduce(
    (acc, count, idx) => {
      const statuses = Object.keys(statusBreakdown);
      return statuses[idx] === "READY_BPJS" ? count : acc;
    },
  );

  if (readyBpjsCount > 0) {
    const queuedReadyBpjs = await prisma.bpjsAntreanQueue.count({
      where: { task_id: 1 },
    });

    if (queuedReadyBpjs === 0) {
      console.log(
        `\n❌ CRITICAL: Found ${readyBpjsCount} READY_BPJS events but 0 are queued!`,
      );
      console.log(
        "   💡 buildQueue() might not be running or filter is wrong.",
      );
    }
  }

  // 6. Show sample READY_BPJS event
  const readyEvent = allEvents.find(
    (e) => (e.task_progress as any)?.["1"]?.status === "READY_BPJS",
  );
  if (readyEvent) {
    console.log(`\n📋 Sample READY_BPJS event:`);
    console.log(`   visit_id: ${readyEvent.visit_id}`);
    console.log(`   poli_id: ${readyEvent.poli_id}`);
    console.log(`   dokter_id: ${readyEvent.dokter_id}`);
    console.log(`   created: ${readyEvent.createdAt}`);
  }

  // 7. Show polling state
  const pollingState = await prisma.pollingState.findUnique({
    where: { source: "REGISTER" },
  });
  if (pollingState) {
    console.log(`\n⏱️  PollingState (REGISTER):`);
    console.log(`   last_event_time: ${pollingState.last_event_time}`);
    console.log(`   pending_cursor: ${pollingState.pending_cursor}`);
    console.log(`   batch_count: ${pollingState.batch_count}`);
  }

  console.log("\n✅ Diagnosis complete!");
}

diagnose().then(() => process.exit(0));

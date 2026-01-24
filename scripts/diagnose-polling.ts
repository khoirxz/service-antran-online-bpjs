import "dotenv/config";
import prisma from "../src/lib/prisma";
import { khanzaDb } from "../src/khanza/khanza.client";

async function diagnosePolling() {
  console.log("=== 1. Polling State ===");
  const states = await prisma.pollingState.findMany();
  for (const s of states) {
    console.log({
      source: s.source,
      last_event_time: s.last_event_time.toISOString(),
      pending_cursor: s.pending_cursor,
      batch_count: Number(s.batch_count),
    });
  }

  console.log("\n=== 2. VisitEvent hari ini (2026-01-24) ===");
  const today = new Date("2026-01-24");
  const tomorrow = new Date("2026-01-25");
  const todayEvents = await prisma.visitEvent.findMany({
    where: {
      tanggal: { gte: today, lt: tomorrow },
    },
    take: 5,
  });
  console.log("Total hari ini:", todayEvents.length);
  for (const e of todayEvents) {
    console.log({
      visit_id: e.visit_id,
      tanggal: e.tanggal.toISOString().slice(0, 10),
      task_progress: e.task_progress,
    });
  }

  console.log("\n=== 3. Queue Stats ===");
  const pending = await prisma.bpjsAntreanQueue.count({
    where: { status: "PENDING" },
  });
  const sent = await prisma.bpjsAntreanQueue.count({
    where: { status: "SEND" },
  });
  const failed = await prisma.bpjsAntreanQueue.count({
    where: { status: "FAILED" },
  });
  console.log("PENDING:", pending);
  console.log("SENT:", sent);
  console.log("FAILED:", failed);

  console.log("\n=== 4. Queue terbaru ===");
  const recentQueues = await prisma.bpjsAntreanQueue.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const q of recentQueues) {
    console.log({
      visit_id: q.visit_id,
      task_id: q.task_id,
      status: q.status,
      created: q.createdAt?.toISOString(),
    });
  }

  console.log("\n=== 5. Cek data registrasi hari ini di Khanza ===");
  const [rows] = await khanzaDb.query(
    `
    SELECT COUNT(*) as total, tgl_registrasi
    FROM reg_periksa
    WHERE kd_pj = 'BPJ'
    AND tgl_registrasi >= '2026-01-24'
    GROUP BY tgl_registrasi
    ORDER BY tgl_registrasi
  `,
  );
  console.log("Data di Khanza:", rows);

  console.log("\n=== 6. Cek REGISTER cursor vs data Khanza ===");
  const registerState = states.find((s) => s.source === "REGISTER");
  if (registerState) {
    const cursor =
      registerState.pending_cursor ||
      registerState.last_event_time
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
    console.log("Current cursor:", cursor);

    const [nextRows] = await khanzaDb.query(
      `
      SELECT no_rawat, tgl_registrasi, jam_reg
      FROM reg_periksa
      WHERE kd_pj = 'BPJ'
      AND (tgl_registrasi > ? OR (tgl_registrasi = ? AND jam_reg > ?))
      ORDER BY tgl_registrasi, jam_reg
      LIMIT 5
    `,
      [cursor.slice(0, 10), cursor.slice(0, 10), cursor.slice(11, 19)],
    );
    console.log("Next rows after cursor:", nextRows);
  }

  await khanzaDb.end();
  await prisma.$disconnect();
}

diagnosePolling().catch((e) => {
  console.error(e);
  process.exit(1);
});

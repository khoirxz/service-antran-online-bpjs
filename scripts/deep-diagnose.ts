import "dotenv/config";
import prisma from "../src/lib/prisma";
import { khanzaDb } from "../src/khanza/khanza.client";

async function deepDiagnose() {
  console.log("=== DIAGNOSIS MENDALAM ===");

  console.log("\n1. Cek data registrasi Khanza untuk 2026-01-24:");
  const [todayKhanza] = await khanzaDb.query(
    `SELECT no_rawat, tgl_registrasi, jam_reg, no_rkm_medis, kd_poli, kd_dokter
     FROM reg_periksa 
     WHERE kd_pj = 'BPJ' AND tgl_registrasi = '2026-01-24'
     ORDER BY jam_reg`,
  );
  console.log("Jumlah registrasi hari ini di Khanza:", todayKhanza.length);
  if (todayKhanza.length > 0) {
    console.log("Sample:", todayKhanza.slice(0, 3));
  }

  console.log("\n2. Cek VisitEvent vs registrasi Khanza:");
  const visitEvents = await prisma.visitEvent.findMany({
    where: {
      tanggal: { gte: new Date("2026-01-24"), lt: new Date("2026-01-25") },
    },
    select: { visit_id: true, no_rkm_medis: true, task_progress: true },
  });
  console.log("VisitEvent hari ini:", visitEvents.length);

  // Cek apakah VisitEvent ini valid (ada di Khanza)
  if (visitEvents.length > 0) {
    const visitIds = visitEvents.map((v) => v.visit_id);
    const [khanzaEvents] = await khanzaDb.query(
      `SELECT no_rawat FROM reg_periksa WHERE no_rawat IN (${visitIds.map(() => "?").join(",")})`,
      visitIds,
    );
    console.log("VisitEvent yang valid di Khanza:", khanzaEvents.length);
  }

  console.log("\n3. Cek kenapa tidak ada queue untuk VisitEvent hari ini:");
  const queues = await prisma.bpjsAntreanQueue.findMany({
    where: {
      visit_id: { in: visitEvents.map((v) => v.visit_id) },
    },
  });
  console.log("Queue untuk VisitEvent hari ini:", queues.length);

  console.log("\n4. Cek REGISTER polling - data setelah cursor:");
  const registerState = await prisma.pollingState.findFirst({
    where: { source: "REGISTER" },
  });
  if (registerState) {
    const cursor =
      registerState.pending_cursor ||
      registerState.last_event_time
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);

    console.log("Current cursor:", cursor);

    // Cek data yang seharusnya diproses
    const [pendingData] = await khanzaDb.query(
      `SELECT no_rawat, tgl_registrasi, jam_reg, no_rkm_medis, kd_poli
       FROM reg_periksa
       WHERE kd_pj = 'BPJ'
       AND (tgl_registrasi > ? OR (tgl_registrasi = ? AND jam_reg > ?))
       ORDER BY tgl_registrasi, jam_reg
       LIMIT 10`,
      [cursor.slice(0, 10), cursor.slice(0, 10), cursor.slice(11, 19)],
    );
    console.log("Data pending setelah cursor:", pendingData.length);
    if (pendingData.length > 0) {
      console.log("Sample pending data:", pendingData.slice(0, 3));
    }
  }

  console.log("\n5. Cek gap antara cursor dan data sebenarnya:");
  const [allAfterYesterday] = await khanzaDb.query(
    `SELECT tgl_registrasi, COUNT(*) as total
     FROM reg_periksa
     WHERE kd_pj = 'BPJ' AND tgl_registrasi > '2026-01-23'
     GROUP BY tgl_registrasi
     ORDER BY tgl_registrasi`,
  );
  console.log("Data setelah kemarin:", allAfterYesterday);

  console.log("\n6. Cek queue builder terakhir jalan:");
  const recentBuildLog = await prisma.bpjsAntreanQueue.findFirst({
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, visit_id: true, task_id: true },
  });
  if (recentBuildLog) {
    console.log("Queue terakhir dibuat:", {
      waktu: recentBuildLog.createdAt?.toISOString(),
      visit_id: recentBuildLog.visit_id,
      task_id: recentBuildLog.task_id,
    });
  }

  await khanzaDb.end();
  await prisma.$disconnect();
}

deepDiagnose().catch(console.error);

#!/usr/bin/env npx tsx
/**
 * Script Instalasi & Setup Antrol Service
 *
 * Menangani:
 * 1. Test koneksi ke semua service (Khanza, BPJS, Database lokal)
 * 2. Sync HFIS snapshot (jadwal dokter, poli, kuota)
 * 3. Reset polling state
 * 4. Validasi konfigurasi
 *
 * Usage: npx tsx scripts/install.ts [--reset] [--sync-only] [--test-only]
 */

import mysql from "mysql2/promise";
import prisma from "../src/lib/prisma";

// ============ CONFIGURATION ============
const CONFIG = {
  khanza: {
    host: process.env.KHANZA_DB_HOST || "localhost",
    user: process.env.KHANZA_DB_USER || "dba",
    password: process.env.KHANZA_DB_PASSWORD || "DBA_Prasetya99",
    database: process.env.KHANZA_DB_NAME || "sik",
  },
  // Polling state default start date
  pollingStartDate: "2026-01-22T00:00:00Z",
};

// ============ HELPER FUNCTIONS ============
function log(emoji: string, message: string) {
  console.log(`${emoji}  ${message}`);
}

function logSection(title: string) {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`   ${title}`);
  console.log(`${"=".repeat(50)}\n`);
}

// ============ 1. TEST CONNECTIONS ============
async function testConnections(): Promise<{
  khanza: boolean;
  prisma: boolean;
}> {
  logSection("1. TEST KONEKSI");

  const results = { khanza: false, prisma: false };

  // Test Khanza DB
  try {
    const khanzaDb = mysql.createPool({
      ...CONFIG.khanza,
      waitForConnections: true,
      connectionLimit: 1,
    });
    await khanzaDb.query("SELECT 1");
    await khanzaDb.end();
    log("✅", `Khanza DB: ${CONFIG.khanza.host}/${CONFIG.khanza.database}`);
    results.khanza = true;
  } catch (error: any) {
    log("❌", `Khanza DB: ${error.message}`);
  }

  // Test Prisma/Local DB
  try {
    await prisma.$queryRaw`SELECT 1`;
    log("✅", "Local DB (Prisma): Connected");
    results.prisma = true;
  } catch (error: any) {
    log("❌", `Local DB (Prisma): ${error.message}`);
  }

  return results;
}

// ============ 2. SYNC HFIS SNAPSHOT ============
async function syncHfisSnapshot(): Promise<number> {
  logSection("2. SYNC HFIS SNAPSHOT");

  const khanzaDb = mysql.createPool({
    ...CONFIG.khanza,
    waitForConnections: true,
    connectionLimit: 5,
  });

  try {
    // Get jadwal dokter dari Khanza
    log("🔄", "Mengambil jadwal dokter dari Khanza...");

    const [jadwalRows] = await khanzaDb.query(`
      SELECT 
        j.kd_dokter,
        mpd.kd_dokter_bpjs,
        mpd.nm_dokter_bpjs as nama_dokter,
        j.kd_poli,
        mp.kd_poli_bpjs,
        mp.nm_poli_bpjs as nama_poli,
        j.hari_kerja,
        j.jam_mulai,
        j.jam_selesai,
        j.kuota
      FROM jadwal j
      LEFT JOIN maping_dokter_dpjpvclaim mpd ON j.kd_dokter = mpd.kd_dokter
      LEFT JOIN maping_poli_bpjs mp ON j.kd_poli = mp.kd_poli_bpjs
      WHERE mpd.kd_dokter_bpjs IS NOT NULL
      AND mp.kd_poli_bpjs IS NOT NULL
    `);

    const jadwalList = jadwalRows as any[];
    log("📊", `Ditemukan ${jadwalList.length} jadwal dokter`);

    if (jadwalList.length === 0) {
      log("⚠️", "Tidak ada jadwal ditemukan. Periksa tabel mapping!");
      await khanzaDb.end();
      return 0;
    }

    // Generate tanggal untuk 7 hari ke depan
    const today = new Date();
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }

    log(
      "📅",
      `Membuat snapshot untuk tanggal: ${dates[0]} - ${dates[dates.length - 1]}`,
    );

    // Map hari ke nama Indonesia
    const hariMap: Record<string, string> = {
      MINGGU: "0",
      SENIN: "1",
      SELASA: "2",
      RABU: "3",
      KAMIS: "4",
      JUMAT: "5",
      SABTU: "6",
    };

    let created = 0;
    let updated = 0;
    const now = new Date();

    for (const tanggal of dates) {
      const dayOfWeek = new Date(tanggal).getDay().toString();

      for (const jadwal of jadwalList) {
        const jadwalHari = hariMap[jadwal.hari_kerja?.toUpperCase()];
        if (jadwalHari !== dayOfWeek) continue;

        const poliId = jadwal.kd_poli_bpjs;
        const dokterId = jadwal.kd_dokter_bpjs;
        const jamMulai = jadwal.jam_mulai || "08:00:00";
        const jamSelesai = jadwal.jam_selesai || "12:00:00";

        if (!poliId || !dokterId) continue;

        try {
          // Upsert ke DoctorScheduleQuota
          const existing = await prisma.doctorScheduleQuota.findFirst({
            where: {
              tanggal: new Date(tanggal),
              poli_id: poliId,
              dokter_id: dokterId,
              jam_mulai: jamMulai,
            },
          });

          if (existing) {
            await prisma.doctorScheduleQuota.update({
              where: { id: existing.id },
              data: {
                jam_selesai: jamSelesai,
                kuota_jkn: jadwal.kuota || 20,
                nama_dokter: jadwal.nama_dokter || "Unknown",
                nama_poli: jadwal.nama_poli || "Unknown",
                fetchedAt: now,
              },
            });
            updated++;
          } else {
            await prisma.doctorScheduleQuota.create({
              data: {
                tanggal: new Date(tanggal),
                poli_id: poliId,
                dokter_id: dokterId,
                nama_dokter: jadwal.nama_dokter || "Unknown",
                nama_poli: jadwal.nama_poli || "Unknown",
                jam_mulai: jamMulai,
                jam_selesai: jamSelesai,
                kuota_jkn: jadwal.kuota || 20,
                source: "KHANZA",
                fetchedAt: now,
              },
            });
            created++;
          }
        } catch (error: any) {
          // Skip duplicate errors
          if (!error.message.includes("Unique constraint")) {
            console.error(
              `Error untuk ${tanggal}/${poliId}/${dokterId}:`,
              error.message,
            );
          }
        }
      }
    }

    log("✅", `Snapshot dibuat: ${created} baru, ${updated} diupdate`);
    await khanzaDb.end();
    return created + updated;
  } catch (error: any) {
    log("❌", `Error sync HFIS: ${error.message}`);
    await khanzaDb.end();
    throw error;
  }
}

// ============ 3. SYNC POLI ============
async function syncPoli(): Promise<number> {
  logSection("3. SYNC DATA POLI");

  const khanzaDb = mysql.createPool({
    ...CONFIG.khanza,
    waitForConnections: true,
    connectionLimit: 5,
  });

  try {
    const [poliRows] = await khanzaDb.query(`
      SELECT kd_poli_bpjs, nm_poli_bpjs
      FROM maping_poli_bpjs
      WHERE kd_poli_bpjs IS NOT NULL AND kd_poli_bpjs != ''
    `);

    const poliList = poliRows as any[];
    log("📊", `Ditemukan ${poliList.length} poli`);

    let created = 0;

    for (const poli of poliList) {
      try {
        await prisma.poli.upsert({
          where: { kode_poli: poli.kd_poli_bpjs },
          update: { nama_poli: poli.nm_poli_bpjs },
          create: {
            kode_poli: poli.kd_poli_bpjs,
            nama_poli: poli.nm_poli_bpjs,
          },
        });
        created++;
      } catch (error: any) {
        // Skip errors
      }
    }

    log("✅", `Poli disync: ${created}`);
    await khanzaDb.end();
    return created;
  } catch (error: any) {
    log("❌", `Error sync poli: ${error.message}`);
    await khanzaDb.end();
    throw error;
  }
}

// ============ 4. RESET POLLING STATE ============
async function resetPollingState(startDate?: string): Promise<void> {
  logSection("4. RESET POLLING STATE");

  const sources = [
    "REGISTER",
    "CHECKIN",
    "START",
    "FINISH",
    "PHARMACY_STARTED",
    "CLOSE",
  ];

  const resetTime = new Date(startDate || CONFIG.pollingStartDate);
  log("📅", `Reset polling ke: ${resetTime.toISOString()}`);

  for (const source of sources) {
    try {
      const existing = await prisma.pollingState.findUnique({
        where: { source },
      });

      if (existing) {
        await prisma.pollingState.update({
          where: { source },
          data: {
            last_event_time: resetTime,
            pending_cursor: null,
            batch_count: 0,
          },
        });
        log("✅", `Reset ${source}`);
      } else {
        await prisma.pollingState.create({
          data: {
            source,
            last_event_time: resetTime,
            pending_cursor: null,
            batch_count: 0,
          },
        });
        log("✅", `Created ${source}`);
      }
    } catch (error: any) {
      log("❌", `Error ${source}: ${error.message}`);
    }
  }
}

// ============ 5. CLEAR OLD QUEUE ============
async function clearOldQueue(): Promise<void> {
  logSection("5. CLEAR QUEUE LAMA (PENDING/FAILED)");

  const deleted = await prisma.bpjsAntreanQueue.deleteMany({
    where: {
      status: { in: ["PENDING", "FAILED"] },
    },
  });

  log("🗑️", `Deleted ${deleted.count} queue items (PENDING/FAILED)`);
}

// ============ 6. VALIDATE SETUP ============
async function validateSetup(): Promise<boolean> {
  logSection("6. VALIDASI SETUP");

  let valid = true;

  // Check DoctorScheduleQuota
  const quotaCount = await prisma.doctorScheduleQuota.count();
  if (quotaCount > 0) {
    log("✅", `DoctorScheduleQuota: ${quotaCount} records`);
  } else {
    log("❌", "DoctorScheduleQuota: KOSONG! Jalankan sync HFIS");
    valid = false;
  }

  // Check Poli
  const poliCount = await prisma.poli.count();
  if (poliCount > 0) {
    log("✅", `Poli: ${poliCount} records`);
  } else {
    log("❌", "Poli: KOSONG! Jalankan sync poli");
    valid = false;
  }

  // Check Polling State
  const stateCount = await prisma.pollingState.count();
  if (stateCount >= 6) {
    log("✅", `PollingState: ${stateCount} records`);
  } else {
    log("⚠️", `PollingState: Hanya ${stateCount} records (expected 6)`);
  }

  // Show sample DoctorScheduleQuota untuk hari ini
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayQuota = await prisma.doctorScheduleQuota.findMany({
    where: {
      tanggal: { gte: today, lt: tomorrow },
    },
    take: 5,
  });

  if (todayQuota.length > 0) {
    log("📋", `Sample jadwal hari ini:`);
    for (const q of todayQuota) {
      console.log(
        `     Poli: ${q.poli_id}, Dokter: ${q.dokter_id}, Jam: ${q.jam_mulai}-${q.jam_selesai}`,
      );
    }
  } else {
    log("⚠️", "Tidak ada jadwal untuk hari ini!");
  }

  return valid;
}

// ============ 7. SHOW SUMMARY ============
async function showSummary(): Promise<void> {
  logSection("SUMMARY");

  const [visitCount, queueCount, sentCount] = await Promise.all([
    prisma.visitEvent.count(),
    prisma.bpjsAntreanQueue.count({ where: { status: "PENDING" } }),
    prisma.bpjsAntreanQueue.count({ where: { status: "SEND" } }),
  ]);

  console.log(`📊 VisitEvent total    : ${visitCount}`);
  console.log(`📤 Queue PENDING       : ${queueCount}`);
  console.log(`✅ Queue SENT          : ${sentCount}`);

  const states = await prisma.pollingState.findMany();
  console.log(`\n📍 Polling State:`);
  for (const state of states) {
    const cursor = state.pending_cursor || state.last_event_time.toISOString();
    console.log(`   ${state.source.padEnd(18)} : ${cursor}`);
  }
}

// ============ MAIN ============
async function main() {
  console.log(`
╔═══════════════════════════════════════════════════╗
║       ANTROL SERVICE - INSTALLATION SCRIPT        ║
╚═══════════════════════════════════════════════════╝
`);

  const args = process.argv.slice(2);
  const isReset = args.includes("--reset");
  const isSyncOnly = args.includes("--sync-only");
  const isTestOnly = args.includes("--test-only");

  try {
    // 1. Test connections
    const connections = await testConnections();

    if (!connections.khanza || !connections.prisma) {
      log("❌", "Koneksi gagal. Periksa konfigurasi!");
      process.exit(1);
    }

    if (isTestOnly) {
      await showSummary();
      await prisma.$disconnect();
      return;
    }

    // 2. Sync HFIS Snapshot
    await syncHfisSnapshot();

    // 3. Sync Poli
    await syncPoli();

    if (isSyncOnly) {
      await validateSetup();
      await showSummary();
      await prisma.$disconnect();
      return;
    }

    // 4. Reset polling state (if requested or first install)
    if (isReset) {
      await resetPollingState();
      await clearOldQueue();
    }

    // 5. Validate
    const isValid = await validateSetup();

    // 6. Summary
    await showSummary();

    if (isValid) {
      console.log(`
╔═══════════════════════════════════════════════════╗
║              ✅ INSTALASI BERHASIL!               ║
╠═══════════════════════════════════════════════════╣
║  Jalankan service dengan: pnpm run dev            ║
╚═══════════════════════════════════════════════════╝
`);
    } else {
      console.log(`
╔═══════════════════════════════════════════════════╗
║         ⚠️  INSTALASI SELESAI DENGAN WARNING      ║
╠═══════════════════════════════════════════════════╣
║  Periksa error di atas sebelum menjalankan        ║
╚═══════════════════════════════════════════════════╝
`);
    }

    await prisma.$disconnect();
  } catch (error: any) {
    console.error("\n❌ FATAL ERROR:", error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();

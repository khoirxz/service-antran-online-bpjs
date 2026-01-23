/**
 * Diagnostic script untuk check kuota dari Khanza
 *
 * Usage: npx ts-node scripts/diagnose-quota.ts
 */
import dotenv from "dotenv";
import { fetchRegisterEvents } from "../src/khanza/khanza.query";
import { calculateQuota } from "../src/domain/quota.aggregator";
import prisma from "../src/lib/prisma";
import { formatLocalDate } from "../src/utils/formatDate";
dotenv.config();

async function diagnoseQuota() {
  console.log("🔍 Diagnosing Kuota Flow...\n");

  // 1. Get latest register events from Khanza
  console.log("📊 Step 1: Fetching latest register events from Khanza...");
  const lastDate = "2026-01-20"; // atau sesuai kebutuhan
  const lastTime = "00:00:00";

  const khanzaRows = await fetchRegisterEvents(lastDate, lastTime);
  console.log(`   Found ${khanzaRows.length} rows from Khanza`);

  if (khanzaRows.length === 0) {
    console.log("   ❌ NO DATA from Khanza! Check connection atau query.");
    return;
  }

  // 2. Check first 3 samples
  console.log("\n📋 Sample data from Khanza (first 3):");
  const samples = khanzaRows.slice(0, 3);

  for (const row of samples) {
    console.log(`\n   Event: ${row.no_rawat}`);
    console.log(`   - kd_poli: ${row.kd_poli}`);
    console.log(`   - kd_dokter: ${row.kd_dokter}`);
    console.log(`   - tgl_registrasi: ${row.tgl_registrasi}`);
    console.log(`   - jam_mulai: ${row.jam_mulai}`);
    console.log(`   - jam_selesai: ${row.jam_selesai}`);
    console.log(`   - kuota_jkn: ${row.kuota_jkn}`);

    // 3. Try to calculate quota
    console.log(`\n   🔄 Calculating quota...`);
    const tgl = formatLocalDate(new Date(row.tgl_registrasi));

    try {
      const quota = await calculateQuota(row.kd_poli, row.kd_dokter, tgl);

      if (quota) {
        console.log(`   ✅ Quota found:`);
        console.log(`      - kuota_jkn: ${quota.kuota_jkn}`);
        console.log(`      - sisa_kuota_jkn: ${quota.sisa_kuota_jkn}`);
        console.log(`      - jam_praktek: ${quota.jam_praktek}`);
      } else {
        console.log(`   ❌ Quota returned NULL!`);

        // 4. Check DoctorScheduleQuota table
        console.log(`\n   🔍 Checking DoctorScheduleQuota table...`);
        const snapshot = await prisma.doctorScheduleQuota.findFirst({
          where: {
            poli_id: row.kd_poli,
            dokter_id: row.kd_dokter,
            tanggal: new Date(tgl),
          },
        });

        if (snapshot) {
          console.log(`   ✅ Found in snapshot:`);
          console.log(`      - kuota_jkn: ${snapshot.kuota_jkn}`);
          console.log(`      - jam_mulai: ${snapshot.jam_mulai}`);
          console.log(`      - jam_selesai: ${snapshot.jam_selesai}`);
        } else {
          console.log(
            `   ❌ NO snapshot for poli=${row.kd_poli}, dokter=${row.kd_dokter}, date=${tgl}`,
          );

          // 5. Check if any snapshot exists for this date
          const anySnapshot = await prisma.doctorScheduleQuota.findMany({
            where: { tanggal: new Date(tgl) },
            take: 1,
          });

          if (anySnapshot.length > 0) {
            console.log(
              `   💡 Snapshots exist for this date, but not for this doctor/poli combination`,
            );
            console.log(
              `      Try checking if poli_id or dokter_id mapping is wrong`,
            );
          } else {
            console.log(
              `   💡 NO snapshots at all for date ${tgl}. Check quota scheduler/refresh.`,
            );
          }
        }
      }
    } catch (error) {
      console.log(`   ❌ Error calculating quota:`, (error as Error).message);
    }
  }

  // 6. Summary of DoctorScheduleQuota
  console.log(`\n📊 DoctorScheduleQuota Summary:`);
  const totalQuota = await prisma.doctorScheduleQuota.count();
  console.log(`   Total records: ${totalQuota}`);

  if (totalQuota > 0) {
    const latestQuota = await prisma.doctorScheduleQuota.findFirst({
      orderBy: { tanggal: "desc" },
    });

    if (latestQuota) {
      console.log(`   Latest snapshot:`);
      console.log(`   - tanggal: ${latestQuota.tanggal}`);
      console.log(`   - poli_id: ${latestQuota.poli_id}`);
      console.log(`   - dokter_id: ${latestQuota.dokter_id}`);
      console.log(`   - kuota_jkn: ${latestQuota.kuota_jkn}`);
    }

    // Check date range
    const oldestQuota = await prisma.doctorScheduleQuota.findFirst({
      orderBy: { tanggal: "asc" },
    });

    console.log(
      `   Date range: ${oldestQuota?.tanggal} to ${latestQuota?.tanggal}`,
    );
  }

  // 7. Check TaskValidationLog
  console.log(`\n📋 Recent TaskValidationLog entries:`);
  const validationLogs = await prisma.taskValidationLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  if (validationLogs.length > 0) {
    console.log(
      `   Found ${validationLogs.length} payload_kuota_missing errors:`,
    );
    validationLogs.forEach((log) => {
      console.log(`\n   - ${log.visit_id}:`);
      console.log(`     expected_task_id: ${log.expected_task_id}`);
      console.log(`     notes: ${log.notes}`);
      console.log(`     created: ${log.createdAt}`);
    });
  } else {
    console.log(`   No payload_kuota_missing errors found`);
  }

  console.log("\n✅ Diagnosis complete!");
}

diagnoseQuota()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

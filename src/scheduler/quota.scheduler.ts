/**
 * Scheduler untuk refresh snapshot jadwal dokter dari BPJS
 * Dijalankan setiap pagi jam 05:00 WIB
 */

import cron from "node-cron";
import { refreshDoctorScheduleFromBpjs } from "../domain/quota.aggregator";
import { syncPoliData } from "../domain/poli.aggregator";
import prisma from "../lib/prisma";
import { POLI as POLI_LIST } from "../const/poli";

/**
 * Ambil daftar poli dari database
 * Jika database kosong, fetch dari BPJS HFIS
 */
async function getPoliList(): Promise<string[]> {
  // Cek data di database
  const polis = await prisma.poli.findMany({
    select: { poli_id: true },
  });

  // Jika ada data, gunakan dari database
  if (polis.length > 0) {
    console.log(`📋 Menggunakan ${polis.length} poli dari database`);
    return polis.map((p) => p.poli_id);
  }

  // Jika kosong, fetch dari BPJS
  console.log("📥 Database poli kosong, fetch dari BPJS HFIS...");
  try {
    await syncPoliData();
    const poliAfterSync = await prisma.poli.findMany({
      select: { poli_id: true },
    });
    console.log(
      `✅ Fetch BPJS berhasil, diperoleh ${poliAfterSync.length} poli`,
    );
    return poliAfterSync.map((p) => p.poli_id);
  } catch (error) {
    console.error("❌ Gagal fetch dari BPJS:", error);
    // Fallback ke hardcode jika semua gagal
    console.warn("⚠️  Menggunakan fallback hardcoded POLI_LIST");
    return POLI_LIST;
  }
}

export function startQuotaScheduler() {
  // Refresh setiap hari jam 05:00 WIB
  cron.schedule("0 5 * * *", async () => {
    console.log("🔄 Memulai refresh jadwal dokter dari BPJS...");

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    // Ambil daftar poli dari database
    const POLI_LIST = await getPoliList();

    // Refresh untuk hari ini dan besok
    for (const tanggal of [today, tomorrow]) {
      for (const poli of POLI_LIST) {
        try {
          await refreshDoctorScheduleFromBpjs(poli, tanggal);
          console.log(`✅ Refresh ${poli} - ${tanggal}`);

          // Delay 500ms untuk menghindari rate limit
          await new Promise((resolve) => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`❌ Gagal refresh ${poli} - ${tanggal}:`, error);
        }
      }
    }

    console.log("✅ Selesai refresh jadwal dokter");
  });

  console.log("📅 Quota scheduler started: refresh setiap hari jam 05:00 WIB");
}

/**
 * Refresh manual untuk tanggal dan poli tertentu
 * Bisa dipanggil dari API endpoint
 */
export async function manualRefreshQuota(
  poliList: string[],
  tanggalList: string[],
) {
  console.log("🔄 Manual refresh jadwal dokter...");

  for (const tanggal of tanggalList) {
    for (const poli of poliList) {
      try {
        await refreshDoctorScheduleFromBpjs(poli, tanggal);
        console.log(`✅ Refresh ${poli} - ${tanggal}`);

        // Delay 500ms untuk menghindari rate limit
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`❌ Gagal refresh ${poli} - ${tanggal}:`, error);
      }
    }
  }

  console.log("✅ Selesai manual refresh");
}

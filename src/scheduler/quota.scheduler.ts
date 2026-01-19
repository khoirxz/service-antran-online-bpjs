/**
 * Scheduler untuk refresh snapshot jadwal dokter dari BPJS
 * Dijalankan setiap pagi jam 05:00 WIB
 */

import cron from "node-cron";
import { refreshDoctorScheduleFromBpjs } from "../domain/quota.aggregator";

// Daftar poli yang perlu di-refresh
// TODO: Bisa di-load dari config atau database
const POLI_LIST = [
  "ANA", // Anak
  "BED", // Bedah
  "INT", // Penyakit Dalam
  "MAT", // Kebidanan
  "OBG", // Kandungan
  "ORT", // Orthopedi
  "THT", // THT
  "PD", // Paru
  "JAN", // Jantung
  "KLT", // Kulit
  "SAR", // Saraf
  "JIW", // Jiwa
  "GIG", // Gigi
];

export function startQuotaScheduler() {
  // Refresh setiap hari jam 05:00 WIB
  cron.schedule("0 5 * * *", async () => {
    console.log("🔄 Memulai refresh jadwal dokter dari BPJS...");

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

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

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

/**
 * Batch refresh dengan rate limiting untuk mencegah overload BPJS API
 * 5 poli per batch, 500ms delay antar batch
 */
async function batchRefreshSchedule(
  poliList: string[],
  tanggalList: string[],
): Promise<void> {
  const BATCH_SIZE = 5;
  const BATCH_DELAY = 500; // ms

  for (const tanggal of tanggalList) {
    // Batch poli untuk menghindari overload
    for (let i = 0; i < poliList.length; i += BATCH_SIZE) {
      const batch = poliList.slice(i, i + BATCH_SIZE);

      // Process batch secara parallel
      await Promise.all(
        batch.map(async (poli) => {
          try {
            await refreshDoctorScheduleFromBpjs(poli, tanggal);
            console.log(`✅ Refresh ${poli} - ${tanggal}`);
          } catch (error) {
            console.error(`❌ Gagal refresh ${poli} - ${tanggal}:`, error);
          }
        }),
      );

      // Delay sebelum batch berikutnya
      if (i + BATCH_SIZE < poliList.length) {
        await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
      }
    }
  }
}

export function startQuotaScheduler() {
  const POLI_LIST_CACHE: { list: string[]; expiry: number } = {
    list: [],
    expiry: 0,
  };

  // Helper function dengan caching untuk getPoliList
  async function getPoliListCached(): Promise<string[]> {
    if (
      POLI_LIST_CACHE.list.length > 0 &&
      Date.now() < POLI_LIST_CACHE.expiry
    ) {
      return POLI_LIST_CACHE.list;
    }

    const list = await getPoliList();
    POLI_LIST_CACHE.list = list;
    POLI_LIST_CACHE.expiry = Date.now() + 3600000; // Cache untuk 1 jam
    return list;
  }

  // Refresh pagi jam 05:00 WIB (full refresh: hari ini + besok)
  cron.schedule("0 5 * * *", async () => {
    console.log("🌅 [05:00] Memulai full refresh jadwal dokter dari BPJS...");

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const poliList = await getPoliListCached();
    await batchRefreshSchedule(poliList, [today, tomorrow]);

    console.log("✅ [05:00] Selesai full refresh jadwal dokter");
  });

  // Refresh siang jam 12:00 WIB (light refresh: hanya hari ini)
  cron.schedule("0 12 * * *", async () => {
    console.log("☀️  [12:00] Memulai light refresh jadwal dokter dari BPJS...");

    const today = new Date().toISOString().slice(0, 10);
    const poliList = await getPoliListCached();
    await batchRefreshSchedule(poliList, [today]);

    console.log("✅ [12:00] Selesai light refresh jadwal dokter");
  });

  // Refresh sore jam 17:00 WIB (light refresh: hanya hari ini)
  cron.schedule("0 17 * * *", async () => {
    console.log("🌆 [17:00] Memulai light refresh jadwal dokter dari BPJS...");

    const today = new Date().toISOString().slice(0, 10);
    const poliList = await getPoliListCached();
    await batchRefreshSchedule(poliList, [today]);

    console.log("✅ [17:00] Selesai light refresh jadwal dokter");
  });

  console.log(
    "📅 Quota scheduler started: full refresh 05:00, light refresh 12:00 & 17:00 WIB",
  );
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

/**
 * Scheduler untuk sinkronisasi data poli dari BPJS
 * Berjalan otomatis setiap minggu atau bisa di-trigger manual via API
 */

import cron from "node-cron";
import { syncPoliData } from "../domain/poli.aggregator";

/**
 * Start scheduler untuk sync poli
 * Jalankan setiap Senin pukul 06:00 WIB
 */
export function startPoliScheduler(): void {
  // Cron: 0 6 * * 1 = Setiap Senin jam 06:00
  const task = cron.schedule("0 6 * * 1", async () => {
    console.log("⏰ [Poli Scheduler] Memulai sinkronisasi data poli...");
    try {
      await syncPoliData();
      console.log("✅ [Poli Scheduler] Sinkronisasi poli berhasil");
    } catch (error: any) {
      console.error(
        "❌ [Poli Scheduler] Error sinkronisasi poli:",
        error.message,
      );
    }
  });

  console.log("📅 [Poli Scheduler] Scheduled untuk Senin 06:00 WIB");
}

/**
 * Manual trigger sinkronisasi poli
 * Dipanggil via API endpoint
 */
export async function manualSyncPoli(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    console.log("🔄 [Manual] Memulai sinkronisasi poli...");
    await syncPoliData();
    return {
      success: true,
      message: "Sinkronisasi poli berhasil",
    };
  } catch (error: any) {
    console.error("❌ [Manual] Error sinkronisasi poli:", error.message);
    return {
      success: false,
      message: `Gagal sinkronisasi poli: ${error.message}`,
    };
  }
}

import cron from "node-cron";
import { buildQueue } from "../queue/queue.builder";

/**
 * Queue builder scheduler - Build queue dari READY_BPJS events
 * Berjalan setiap 1 menit
 */
export function startQueueBuilder() {
  cron.schedule("*/1 * * * *", async () => {
    try {
      await buildQueue();
    } catch (error) {
      console.error("❌ Error building queue:", error);
    }
  });

  console.log("📦 Queue Builder started: building queue every 1 minute");
}

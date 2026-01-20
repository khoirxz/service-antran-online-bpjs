import cron from "node-cron";
import { processQueueJob } from "../queue/queue.worker";

/**
 * Worker scheduler - Process queue jobs
 * Berjalan setiap 5 detik
 */
export function startWorker() {
  cron.schedule("*/5 * * * * *", async () => {
    try {
      await processQueueJob();
    } catch (error) {
      console.error("❌ Error processing queue job:", error);
    }
  });

  console.log("⚙️  Queue Worker started: processing every 5 seconds");
}

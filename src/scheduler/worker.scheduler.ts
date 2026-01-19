import cron from "node-cron";
import { runQueueWorker } from "../queue/queue.worker";

export function startWorker() {
  cron.schedule("*/1 * * * *", async () => {
    try {
      await runQueueWorker();
    } catch (error) {
      console.error("Error running queue worker:", error);
    }
  });
}

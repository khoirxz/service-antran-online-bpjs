import cron from "node-cron";
import { buildQueue } from "../queue/queue.builder";

export function startQueueBuilder() {
  cron.schedule("*/1 * * * *", async () => {
    try {
      await buildQueue();
    } catch (error) {
      console.error("Error building queue:", error);
    }
  });
}

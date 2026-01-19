import "dotenv/config";
import { startPollers } from "./scheduler/poller.scheduler";
import { startWorker } from "./scheduler/worker.scheduler";
import { startQueueBuilder } from "./scheduler/queue.scheduler";
// startWorker();
startPollers();
// startQueueBuilder();

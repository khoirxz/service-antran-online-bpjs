import "dotenv/config";
import { startPollers } from "./scheduler/poller.scheduler"; // mengambil data registrasi dari Khanza
import { startWorker } from "./scheduler/worker.scheduler";
import { startQueueBuilder } from "./scheduler/queue.scheduler";
import { startQuotaScheduler } from "./scheduler/quota.scheduler";
import * as server from "./server";

// Start server
server.app;

// Start quota scheduler (refresh jadwal BPJS setiap pagi)
startQuotaScheduler();

// Start pollers (monitoring Khanza DB)
startPollers();
startWorker();

// TODO: Aktifkan setelah testing
// startQueueBuilder();

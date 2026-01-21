import "dotenv/config";
import { startPollers } from "./scheduler/poller.scheduler"; // mengambil data registrasi dari Khanza
import { startWorker } from "./scheduler/worker.scheduler";
import { startQueueBuilder } from "./scheduler/queue.scheduler";
import { startQuotaScheduler } from "./scheduler/quota.scheduler";
import { startPoliScheduler } from "./scheduler/poli.scheduler";
import { startValidationScheduler } from "./scheduler/task.validation.scheduler";
import * as server from "./server";

// Start server
server.app;

// Start quota scheduler (refresh jadwal BPJS setiap pagi)
startQuotaScheduler();

// Start poli scheduler (sinkronisasi poli setiap Senin pukul 06:00)
startPoliScheduler();

// Start validation scheduler (retry resolved validations setiap 30 menit)
startValidationScheduler();

// Start pollers (monitoring Khanza DB)
startPollers();

// Start queue builder (build queue dari READY_BPJS events setiap 1 menit)
startQueueBuilder();

// Start queue worker (process queue jobs setiap 5 detik)
startWorker();

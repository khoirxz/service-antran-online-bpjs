/**
 * Queue Worker - Memproses antrian BPJS
 * Mengambil job PENDING, mengirim ke BPJS API, update status
 */

import prisma from "../lib/prisma";
import { sendToBpjs } from "../bpjs/bpjs.client";
import { updateTaskProgress } from "../domain/task.progress";

const MAX_RETRY = 5;
const RETRY_DELAY_MS = 5000; // 5 detik antar retry

/**
 * Process single job dari queue
 * Dipanggil setiap 5 detik
 */
export async function processQueueJob() {
  // Ambil job yang paling lama menunggu
  const job = await prisma.bpjsAntreanQueue.findFirst({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });

  if (!job) return;

  console.log(
    `📤 Processing queue job: ${job.visit_id} (task_id: ${job.task_id}, retry: ${job.retry_count})`,
  );

  try {
    // Endpoint berbeda untuk REGISTER vs UPDATE
    const endpoint =
      job.task_id === 1 ? "/antrean/add" : "/antrean/updatewaktu";

    // Send ke BPJS
    const response = await sendToBpjs(endpoint, job.payload);

    // Log response
    await prisma.bpjsAntreanLogs.create({
      data: {
        queue_id: job.id,
        request_payload: job.payload || {},
        response_payload: response.data,
        http_code: response.status,
      },
    });

    // Cek response code
    const responseCode = response.data?.metadata?.code;

    // 200 = sukses, 208 = duplikasi (juga dianggap sukses)
    if (responseCode === 200 || responseCode === 208) {
      // Update job status ke SEND
      await prisma.bpjsAntreanQueue.update({
        where: { id: job.id },
        data: {
          status: "SEND",
          sentAt: new Date(),
        },
      });

      // Update VisitEvent
      const visitEvent = await prisma.visitEvent.findUnique({
        where: { visit_id: job.visit_id },
      });

      if (visitEvent) {
        // Untuk REGISTER: ubah status event menjadi SENT_BPJS
        if (job.task_id === 1) {
          await prisma.visitEvent.update({
            where: { visit_id: job.visit_id },
            data: { status: "SENT_BPJS" },
          });
        } else {
          // Untuk UPDATE (3/4/5): update task_progress
          const newProgress = updateTaskProgress(
            visitEvent.task_progress,
            job.task_id,
            "SENT_BPJS",
          );

          await prisma.visitEvent.update({
            where: { visit_id: job.visit_id },
            data: { task_progress: newProgress as any },
          });
        }
      }

      console.log(
        `✅ Success: ${job.visit_id} sent to BPJS (code: ${responseCode})`,
      );
      return;
    }

    // Jika response code bukan 200/208, throw error
    throw new Error(
      `BPJS API returned code ${responseCode}: ${response.data?.metadata?.message ?? "Unknown error"}`,
    );
  } catch (error: any) {
    const retryCount = job.retry_count + 1;
    const errorMsg = error.message || error.toString();

    console.warn(
      `⚠️  Job ${job.visit_id} failed (attempt ${retryCount}/${MAX_RETRY}): ${errorMsg}`,
    );

    // Jika sudah max retry, set ke FAILED
    if (retryCount >= MAX_RETRY) {
      await prisma.bpjsAntreanQueue.update({
        where: { id: job.id },
        data: {
          status: "FAILED",
          retry_count: retryCount,
          last_error: errorMsg,
        },
      });

      // Update VisitEvent
      const visitEvent = await prisma.visitEvent.findUnique({
        where: { visit_id: job.visit_id },
      });

      if (visitEvent) {
        if (job.task_id === 1) {
          // REGISTER failed
          await prisma.visitEvent.update({
            where: { visit_id: job.visit_id },
            data: {
              status: "FAILED_BPJS",
              blocked_reason: `BPJS submission failed after ${MAX_RETRY} attempts: ${errorMsg}`,
            },
          });
        } else {
          // UPDATE (3/4/5) failed
          const newProgress = updateTaskProgress(
            visitEvent.task_progress,
            job.task_id,
            "FAILED_BPJS",
            errorMsg,
          );

          await prisma.visitEvent.update({
            where: { visit_id: job.visit_id },
            data: { task_progress: newProgress as any },
          });
        }
      }

      console.error(
        `❌ Job ${job.visit_id} marked as FAILED after ${MAX_RETRY} retries`,
      );
      return;
    }

    // Masih ada retry tersisa, update dengan increment retry_count
    await prisma.bpjsAntreanQueue.update({
      where: { id: job.id },
      data: {
        retry_count: retryCount,
        last_error: errorMsg,
        // Status tetap PENDING untuk dicoba lagi
      },
    });
  }
}

/**
 * Helper untuk manual retry failed job
 */
export async function retryFailedJob(queueId: bigint) {
  const job = await prisma.bpjsAntreanQueue.findUnique({
    where: { id: queueId },
  });

  if (!job) {
    throw new Error(`Queue job ${queueId} tidak ditemukan`);
  }

  // Reset status dan retry_count
  await prisma.bpjsAntreanQueue.update({
    where: { id: queueId },
    data: {
      status: "PENDING",
      retry_count: 0,
      last_error: null,
    },
  });

  console.log(`🔄 Retrying job ${job.visit_id}...`);
}

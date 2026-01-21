import prisma from "../lib/prisma";
import {
  buildRegisterPayload,
  buildTaskUpdatePayload,
} from "../domain/queue.payload";
import {
  getTaskProgress,
  isRegisterSent,
  isTaskSent,
} from "../domain/task.progress";
import {
  logTaskValidationError,
  getTaskValidationReason,
} from "../domain/task.validator";

/**
 * Build queue dari VisitEvent
 * - REGISTER (task_id=1) untuk events dengan task_progress["1"].status=READY_BPJS
 * - UPDATE (task_id 3/4/5) untuk CHECKIN/START/FINISH (tracked dalam task_progress)
 */
export async function buildQueue() {
  // 1) REGISTER events (READY_BPJS)
  const registerEvents = await prisma.visitEvent.findMany({
    where: {
      is_jkn: true,
    },
    orderBy: { event_time: "asc" },
    take: 100,
  });

  console.log(
    `📦 Checking ${registerEvents.length} events for REGISTER queueing`,
  );

  for (const event of registerEvents) {
    const progress = getTaskProgress(event.task_progress);
    const registerStatus = progress["1"]?.status;

    // Skip jika bukan READY_BPJS
    if (registerStatus !== "READY_BPJS") continue;

    const task_id = 1;

    const exists = await prisma.bpjsAntreanQueue.findUnique({
      where: {
        visit_id_task_id: { visit_id: event.visit_id, task_id },
      },
    });

    if (exists) {
      console.log(
        `⏭️  Event ${event.visit_id} sudah ada di queue (status: ${exists.status})`,
      );
      continue;
    }

    try {
      const payload = await buildRegisterPayload(event);

      await prisma.bpjsAntreanQueue.create({
        data: {
          visit_id: event.visit_id,
          task_id,
          event_time: event.event_time,
          payload: JSON.parse(JSON.stringify(payload)),
        },
      });

      console.log(
        `✅ Queued ${event.visit_id} - poli: ${event.poli_id}, antrean: ${event.nomor_antrean}`,
      );
    } catch (error) {
      console.error(
        `❌ Error queueing ${event.visit_id}:`,
        (error as Error).message,
      );
    }
  }

  // 2) UPDATE events (CHECKIN/START/FINISH from task_progress)
  const updateEvents = await prisma.visitEvent.findMany({
    orderBy: { event_time: "asc" },
    take: 500,
  });

  console.log(
    `🕒 Found ${updateEvents.length} total events, checking task_progress...`,
  );

  // Task IDs to check: 3=CHECKIN, 4=START, 5=FINISH, 6=PHARMACY_STARTED, 7=CLOSE
  const updateTaskIds = [3, 4, 5, 6, 7];

  for (const event of updateEvents) {
    const progress = getTaskProgress(event.task_progress);

    for (const task_id of updateTaskIds) {
      const taskStatus = progress[task_id.toString()];

      // Skip jika task belum DRAFT (tidak ada record)
      if (!taskStatus) continue;

      const exists = await prisma.bpjsAntreanQueue.findUnique({
        where: {
          visit_id_task_id: { visit_id: event.visit_id, task_id },
        },
      });

      if (exists) continue;

      // Pastikan REGISTER sudah berhasil dikirim
      const registerQueue = await prisma.bpjsAntreanQueue.findUnique({
        where: {
          visit_id_task_id: {
            visit_id: event.visit_id,
            task_id: 1,
          },
        },
        select: { status: true },
      });

      const registerSent =
        isRegisterSent(event.task_progress) || registerQueue?.status === "SEND";

      if (!registerSent) {
        console.log(
          `⏭️  Skip update ${event.visit_id} (task_id ${task_id}) karena REGISTER (task 1) belum terkirim`,
        );
        const reason = getTaskValidationReason(task_id, 1);
        await logTaskValidationError(
          event.visit_id,
          task_id,
          1,
          1,
          reason,
          undefined,
          `Task ${task_id} diterima tapi REGISTER (task 1) belum dikirim ke BPJS`,
        );
        continue;
      }

      // Untuk task 4: pastikan task 3 (CHECKIN) sudah terkirim
      if (task_id === 4) {
        const task3Sent = isTaskSent(event.task_progress, 3);
        if (!task3Sent) {
          console.log(
            `⏭️  Skip update ${event.visit_id} (task_id ${task_id}) karena task 3 (CHECKIN) belum terkirim`,
          );
          const reason = getTaskValidationReason(task_id, 3);
          await logTaskValidationError(
            event.visit_id,
            task_id,
            3,
            3,
            reason,
            undefined,
            `Task ${task_id} diterima tapi task 3 (CHECKIN) belum dikirim ke BPJS`,
          );
          continue;
        }
      }

      // Untuk task 5, 6, 7: pastikan task 4 (START) sudah terkirim
      if (task_id === 5 || task_id === 6 || task_id === 7) {
        const task4Sent = isTaskSent(event.task_progress, 4);
        if (!task4Sent) {
          console.log(
            `⏭️  Skip update ${event.visit_id} (task_id ${task_id}) karena task 4 (START) belum terkirim`,
          );
          const reason = getTaskValidationReason(task_id, 4);
          await logTaskValidationError(
            event.visit_id,
            task_id,
            4,
            4,
            reason,
            undefined,
            `Task ${task_id} diterima tapi task 4 (START) belum dikirim ke BPJS`,
          );
          continue;
        }
      }

      // Untuk task 7 (CLOSE): pastikan task 5 (FINISH) atau task 6 (PHARMACY_STARTED) sudah terkirim
      if (task_id === 7) {
        const task5Sent = isTaskSent(event.task_progress, 5);
        const task6Sent = isTaskSent(event.task_progress, 6);
        if (!task5Sent && !task6Sent) {
          console.log(
            `⏭️  Skip update ${event.visit_id} (task_id ${task_id}) karena task 5 dan 6 belum terkirim`,
          );
          const reason = getTaskValidationReason(task_id, 5);
          await logTaskValidationError(
            event.visit_id,
            task_id,
            5,
            5,
            reason,
            undefined,
            `Task ${task_id} diterima tapi task 5 (FINISH) dan 6 (PHARMACY) belum dikirim ke BPJS`,
          );
          continue;
        }
      }

      try {
        const payload = await buildTaskUpdatePayload(event, task_id);

        await prisma.bpjsAntreanQueue.create({
          data: {
            visit_id: event.visit_id,
            task_id,
            event_time: event.event_time,
            payload: JSON.parse(JSON.stringify(payload)),
          },
        });

        console.log(
          `✅ Queued update ${event.visit_id} (task_id ${task_id}) at ${event.event_time.toISOString()}`,
        );
      } catch (error) {
        console.error(
          `❌ Error queueing update ${event.visit_id}:`,
          (error as Error).message,
        );
      }
    }
  }
}

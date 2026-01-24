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
  // 1) REGISTER events (READY_BPJS yang belum di-queue)
  const registerEvents = (await prisma.$queryRaw`
    SELECT *
    FROM VisitEvent v
    WHERE v.is_jkn = true
    AND JSON_EXTRACT(v.task_progress, '$."1".status') = 'READY_BPJS'
    AND NOT EXISTS (
      SELECT 1 FROM BpjsAntreanQueue q 
      WHERE q.visit_id = v.visit_id AND q.task_id = 1
    )
    ORDER BY v.event_time DESC
  `) as any[];

  console.log(
    `📦 Found ${registerEvents.length} READY_BPJS events ready for queueing`,
  );

  for (const event of registerEvents) {
    const task_id = 1;

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

  // 2) UPDATE events (task 3/4/5/6/7 yang DRAFT dan belum di-queue)
  const updateTaskIds = [3, 4, 5, 6, 7];

  for (const task_id of updateTaskIds) {
    // Ambil events yang mungkin punya task ini (recent 200 events)
    const candidateEvents = await prisma.visitEvent.findMany({
      orderBy: { event_time: "desc" },
      take: 200,
    });

    const updateEvents = candidateEvents.filter((event) => {
      const progress = getTaskProgress(event.task_progress);
      return progress[task_id.toString()] != null; // Ada task ini dalam progress
    });

    // Filter yang belum ada di queue
    const visitIds = updateEvents.map((e) => e.visit_id);
    const existingQueues = await prisma.bpjsAntreanQueue.findMany({
      where: {
        visit_id: { in: visitIds },
        task_id: task_id,
      },
      select: { visit_id: true },
    });

    const existingVisitIds = new Set(existingQueues.map((q) => q.visit_id));
    const filteredEvents = updateEvents.filter(
      (e) => !existingVisitIds.has(e.visit_id),
    );

    console.log(
      `🕒 Found ${filteredEvents.length} events with task ${task_id} ready for queueing`,
    );

    for (const event of filteredEvents) {
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

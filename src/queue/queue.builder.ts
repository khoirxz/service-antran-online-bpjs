import prisma from "../lib/prisma";
import {
  buildRegisterPayload,
  buildTaskUpdatePayload,
} from "../domain/queue.payload";
import { mapEventToTaskId } from "../domain/task.mapper";
import { isTaskSent, getTaskProgress } from "../domain/task.progress";

/**
 * Build queue dari VisitEvent
 * - REGISTER (task_id=1) untuk events READY_BPJS
 * - UPDATE (task_id 3/4/5) untuk CHECKIN/START/FINISH (tracked dalam task_progress)
 */
export async function buildQueue() {
  // 1) REGISTER events
  const registerEvents = await prisma.visitEvent.findMany({
    where: {
      is_jkn: true,
      status: "READY_BPJS",
    },
    orderBy: { event_time: "asc" },
    take: 100,
  });

  console.log(`📦 Found ${registerEvents.length} REGISTER events to queue`);

  for (const event of registerEvents) {
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
  const allEvents = await prisma.visitEvent.findMany({
    orderBy: { event_time: "asc" },
    take: 500,
  });

  console.log(
    `🕒 Found ${allEvents.length} total events, checking task_progress...`,
  );

  // Task IDs to check: 3=CHECKIN, 4=START, 5=FINISH
  const updateTaskIds = [3, 4, 5];

  for (const event of allEvents) {
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

      // Pastikan REGISTER sudah berhasil dikirim: status SENT_BPJS atau queue SEND untuk task 1
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
        event.status === "SENT_BPJS" || registerQueue?.status === "SEND";

      if (!registerSent) {
        console.log(
          `⏭️  Skip update ${event.visit_id} (task_id ${task_id}) karena REGISTER belum terkirim`,
        );
        continue;
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

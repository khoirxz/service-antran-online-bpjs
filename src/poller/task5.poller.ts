import { fetchTaskId } from "../khanza/khanza.query";
import prisma from "../lib/prisma";
import {
  ensurePollingState,
  updatePollingState,
} from "../storage/polling.state";
import {
  createUtcDateFromLocalDateString,
  createUtcDateTimeFromLocal,
} from "../utils/formatDate";
import { updateTaskProgress } from "../domain/task.progress";

export async function pollTaskId5Event() {
  // Task 5 = FINISH
  const state = await ensurePollingState("FINISH");

  if (!state) return;

  const rows = await fetchTaskId(5, state.last_event_time.toISOString());

  let maxEventTime = state.last_event_time;

  for (const row of rows) {
    const eventTimeStr = (
      (row.event_time as any) instanceof Date
        ? (row.event_time as unknown as Date).toISOString()
        : row.event_time
    ) as string;
    const dateStr = eventTimeStr.slice(0, 10);
    const timeStr = eventTimeStr.slice(11, 19);
    const event_time = createUtcDateTimeFromLocal(dateStr, timeStr);
    const tanggal = createUtcDateFromLocalDateString(dateStr);
    console.log("Memproses event FINISH untuk:", event_time);

    if (event_time <= state.last_event_time) continue;

    try {
      // Update existing REGISTER event dengan task progress FINISH
      const existingEvent = await prisma.visitEvent.findUnique({
        where: { visit_id: row.no_rawat },
      });

      if (!existingEvent) {
        console.log(
          `⏭️  REGISTER event tidak ditemukan untuk ${row.no_rawat}, skip FINISH`,
        );
        continue;
      }

      const newProgress = updateTaskProgress(
        existingEvent.task_progress,
        5,
        "DRAFT",
      );

      await prisma.visitEvent.update({
        where: { visit_id: row.no_rawat },
        data: {
          task_progress: newProgress as any,
        },
      });

      console.log(`✅ Updated FINISH progress untuk ${row.no_rawat}`);
    } catch (error: any) {
      console.error("Gagal update FINISH progress:", error);
    }

    if (event_time > maxEventTime) {
      maxEventTime = event_time;
    }
  }
  // update watermark
  if (maxEventTime > state.last_event_time) {
    await updatePollingState("FINISH", maxEventTime);
  }
}

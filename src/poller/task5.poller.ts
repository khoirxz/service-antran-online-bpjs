import { fetchTaskId } from "../khanza/khanza.query";
import prisma from "../lib/prisma";
import {
  ensurePollingState,
  getPollingStateBatchCursor,
  updateBatchCursor,
  commitBatchCursor,
  rollbackBatchCursor,
} from "../storage/polling.state";
import {
  createUtcDateFromLocalDateString,
  createUtcDateTimeFromLocal,
} from "../utils/formatDate";
import { updateTaskProgress } from "../domain/task.progress";

export async function pollTaskId5Event() {
  // Task 5 = FINISH
  const source = "FINISH";
  await ensurePollingState(source);

  let batchNumber = 0;
  let totalProcessed = 0;

  try {
    while (true) {
      // Get current cursor
      const { cursor } = await getPollingStateBatchCursor(source);

      // Fetch batch 100
      const rows = await fetchTaskId(5, cursor);

      if (rows.length === 0) {
        console.log(
          `✅ [FINISH] Finished: ${batchNumber} batches, ${totalProcessed} total events`,
        );
        return;
      }

      batchNumber++;
      let batchMaxEventTime = new Date(cursor.replace(" ", "T") + "Z");

      console.log(
        `📦 [FINISH] Starting batch ${batchNumber} with ${rows.length} records from cursor: ${cursor}`,
      );

      for (const row of rows) {
        const eventTimeStr = (
          (row.event_time as any) instanceof Date
            ? (row.event_time as unknown as Date).toISOString()
            : row.event_time
        ) as string;
        const dateStr = eventTimeStr.slice(0, 10);
        const timeStr = eventTimeStr.slice(11, 19);
        const event_time = createUtcDateTimeFromLocal(dateStr, timeStr);

        // Track max event time
        if (event_time > batchMaxEventTime) {
          batchMaxEventTime = event_time;
        }

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
          totalProcessed++;
        } catch (error: any) {
          console.error(`❌ Error updating ${row.no_rawat}:`, error);
        }
      }

      // Update batch cursor
      const cursorStr = batchMaxEventTime
        .toISOString()
        .replace("T", " ")
        .substring(0, 19);
      await updateBatchCursor(source, cursorStr);

      console.log(
        `✅ [FINISH] Batch ${batchNumber} completed: ${rows.length} events, new cursor: ${cursorStr}`,
      );

      // Small delay
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch (error) {
    console.error(`❌ [FINISH] Error in batch ${batchNumber}:`, error);
    await rollbackBatchCursor(source);
  } finally {
    await commitBatchCursor(source);
  }
}

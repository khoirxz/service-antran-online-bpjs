import cron from "node-cron";
import prisma from "../lib/prisma";
import { fetchTaskId } from "../khanza/khanza.query";
import {
  updateTaskProgress,
  isTaskSent,
  getTaskProgress,
} from "../domain/task.progress";

/**
 * Validation Scheduler - Retry resolved validation issues
 *
 * Setiap 30 menit:
 * 1. Ambil visits yang marked as RESOLVED
 * 2. Query SIMRS untuk cek apakah data sudah lengkap
 * 3. Jika valid (semua tasks tercatat): process ke queue
 * 4. Jika masih invalid: revert ke PENDING
 */
export async function retryResolvedValidations() {
  console.log(
    "🔄 [Validation Scheduler] Checking resolved validation issues...",
  );

  try {
    // 1. Ambil visits yang RESOLVED dan belum diproses ulang dalam 10 menit terakhir
    const resolvedLogs = await prisma.taskValidationLog.findMany({
      where: {
        status: "RESOLVED",
        resolved_at: {
          lte: new Date(Date.now() - 10 * 60 * 1000), // Resolved > 10 min ago
        },
      },
      distinct: ["visit_id"],
      select: {
        visit_id: true,
        resolved_at: true,
      },
    });

    if (resolvedLogs.length === 0) {
      console.log("✅ No resolved validations to retry");
      return;
    }

    console.log(
      `🔍 Found ${resolvedLogs.length} resolved validations to check`,
    );

    for (const log of resolvedLogs) {
      await retryVisitValidation(log.visit_id);
    }
  } catch (error) {
    console.error("❌ Error in validation scheduler:", error);
  }
}

/**
 * Retry validation for a specific visit
 */
async function retryVisitValidation(visitId: string) {
  try {
    // Get current visit event
    const visitEvent = await prisma.visitEvent.findUnique({
      where: { visit_id: visitId },
    });

    if (!visitEvent) {
      console.log(`⏭️  Visit ${visitId} not found, skipping`);
      return;
    }

    // Re-fetch task data from SIMRS
    // fetchTaskId expects (taskId, lastEventTime)
    const lastSync = visitEvent.updatedAt || new Date(0);
    const lastSyncStr = lastSync
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);

    const task3Result = await fetchTaskId(3, lastSyncStr);
    const task4Result = await fetchTaskId(4, lastSyncStr);
    const task5Result = await fetchTaskId(5, lastSyncStr);
    const task7Result = await fetchTaskId(7, lastSyncStr);

    // Update task_progress dengan data terbaru
    let updatedProgress = getTaskProgress(visitEvent.task_progress);

    // Check if this specific visit appears in results
    const visit3 = task3Result.find((r) => r.no_rawat === visitId);
    const visit4 = task4Result.find((r) => r.no_rawat === visitId);
    const visit5 = task5Result.find((r) => r.no_rawat === visitId);
    const visit7 = task7Result.find((r) => r.no_rawat === visitId);

    if (visit3 && !updatedProgress["3"]) {
      updatedProgress = updateTaskProgress(updatedProgress, 3, "DRAFT");
    }
    if (visit4 && !updatedProgress["4"]) {
      updatedProgress = updateTaskProgress(updatedProgress, 4, "DRAFT");
    }
    if (visit5 && !updatedProgress["5"]) {
      updatedProgress = updateTaskProgress(updatedProgress, 5, "DRAFT");
    }
    if (visit7 && !updatedProgress["7"]) {
      updatedProgress = updateTaskProgress(updatedProgress, 7, "DRAFT");
    }

    // Update database - convert progress to JSON safely
    await prisma.visitEvent.update({
      where: { visit_id: visitId },
      data: {
        task_progress: JSON.parse(JSON.stringify(updatedProgress)),
        updatedAt: new Date(),
      },
    });

    // Validate struktur task
    const validated = validateTaskStructure(updatedProgress);

    if (validated.isValid) {
      console.log(
        `✅ Visit ${visitId} validation PASSED after retry. Marking issue as IGNORED.`,
      );

      // Mark semua PENDING logs untuk visit ini sebagai IGNORED (sudah teratasi)
      await prisma.taskValidationLog.updateMany({
        where: {
          visit_id: visitId,
          status: "PENDING",
        },
        data: {
          status: "IGNORED",
          resolved_at: new Date(),
          notes: "Auto-resolved: task data updated from SIMRS",
        },
      });
    } else {
      console.log(
        `⚠️  Visit ${visitId} still invalid: ${validated.errors.join(", ")}. Reverting to PENDING.`,
      );

      // Revert resolved logs back to PENDING
      await prisma.taskValidationLog.updateMany({
        where: {
          visit_id: visitId,
          status: "RESOLVED",
        },
        data: {
          status: "PENDING",
          resolved_at: null,
          notes: `Re-checked from SIMRS: still invalid - ${validated.errors.join(", ")}`,
        },
      });
    }
  } catch (error) {
    console.error(`❌ Error retrying visit ${visitId}:`, error);
  }
}

/**
 * Validate task progression sequence
 */
function validateTaskStructure(taskProgress: any): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const progress = taskProgress || {};

  // Task 1 (REGISTER) harus exist
  if (!progress["1"]) {
    errors.push("task_1_missing");
  }

  // Jika task 3+ exist, task 1 harus ada dulu
  const hasLaterTasks =
    progress["3"] || progress["4"] || progress["5"] || progress["7"];
  if (hasLaterTasks && !progress["1"]) {
    errors.push("task_3_and_later_exist_but_task_1_missing");
  }

  // Jika task 4+ exist, task 3 harus ada
  const hasTask4OrLater = progress["4"] || progress["5"] || progress["7"];
  if (hasTask4OrLater && !progress["3"]) {
    errors.push("task_4_or_later_exist_but_task_3_missing");
  }

  // Jika task 5+ exist, task 4 harus ada
  const hasTask5OrLater = progress["5"] || progress["7"];
  if (hasTask5OrLater && !progress["4"]) {
    errors.push("task_5_or_later_exist_but_task_4_missing");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Start validation retry scheduler
 * Runs every 30 minutes
 */
export function startValidationScheduler() {
  console.log("🕐 Starting validation retry scheduler (every 30 min)");
  cron.schedule("*/30 * * * *", retryResolvedValidations);
  // Also run on startup
  retryResolvedValidations();
}

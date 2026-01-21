import prisma from "../lib/prisma";

/**
 * Task validation error reasons
 * Format: <dependent_task>_<predecessor_task>_<issue_type>
 */
export type TaskValidationReason =
  // Task 3 (CHECKIN) issues
  | "checkin_register_not_sent" // Task 3 diterima tapi task 1 (REGISTER) belum SENT_BPJS

  // Task 4 (START) issues
  | "start_register_not_sent" // Task 4 diterima tapi task 1 (REGISTER) belum SENT_BPJS
  | "start_checkin_not_sent" // Task 4 diterima tapi task 3 (CHECKIN) belum SENT_BPJS

  // Task 5 (FINISH) issues
  | "finish_register_not_sent" // Task 5 diterima tapi task 1 (REGISTER) belum SENT_BPJS
  | "finish_start_not_sent" // Task 5 diterima tapi task 4 (START) belum SENT_BPJS

  // Task 6 (PHARMACY_STARTED) issues
  | "pharmacy_register_not_sent" // Task 6 diterima tapi task 1 (REGISTER) belum SENT_BPJS
  | "pharmacy_finish_not_sent" // Task 6 diterima tapi task 5 (FINISH) belum SENT_BPJS

  // Task 7 (CLOSE) issues
  | "close_register_not_sent" // Task 7 diterima tapi task 1 (REGISTER) belum SENT_BPJS
  | "close_finish_not_sent" // Task 7 diterima tapi task 5 (FINISH) belum SENT_BPJS

  // Generic issues
  | "out_of_order" // Task diterima tidak sesuai urutan
  | "unknown";

/**
 * Determine validation reason based on task_id and missing predecessor
 */
export function getTaskValidationReason(
  taskId: number,
  missingPredecessorTaskId: number,
): TaskValidationReason {
  // Task 3 (CHECKIN) dependencies
  if (taskId === 3) {
    if (missingPredecessorTaskId === 1) return "checkin_register_not_sent";
  }

  // Task 4 (START) dependencies
  if (taskId === 4) {
    if (missingPredecessorTaskId === 1) return "start_register_not_sent";
    if (missingPredecessorTaskId === 3) return "start_checkin_not_sent";
  }

  // Task 5 (FINISH) dependencies
  if (taskId === 5) {
    if (missingPredecessorTaskId === 1) return "finish_register_not_sent";
    if (missingPredecessorTaskId === 4) return "finish_start_not_sent";
  }

  // Task 6 (PHARMACY_STARTED) dependencies
  if (taskId === 6) {
    if (missingPredecessorTaskId === 1) return "pharmacy_register_not_sent";
    if (missingPredecessorTaskId === 5) return "pharmacy_finish_not_sent";
  }

  // Task 7 (CLOSE) dependencies
  if (taskId === 7) {
    if (missingPredecessorTaskId === 1) return "close_register_not_sent";
    if (missingPredecessorTaskId === 5) return "close_finish_not_sent";
  }

  return "unknown";
}

/**
 * Log task validation error untuk tracking data quality issues
 */
export async function logTaskValidationError(
  visitId: string,
  actualTaskId: number,
  expectedTaskId: number | null,
  missingTaskId: number | null,
  reason: TaskValidationReason,
  createdBy?: string,
  notes?: string,
) {
  try {
    const log = await prisma.taskValidationLog.create({
      data: {
        visit_id: visitId,
        actual_task_id: actualTaskId,
        expected_task_id: expectedTaskId,
        missing_task_id: missingTaskId,
        error_reason: reason,
        created_by: createdBy,
        notes,
        status: "PENDING",
      },
    });

    console.log(
      `📋 Logged validation error for ${visitId}: ${reason} (task ${actualTaskId} vs expected ${expectedTaskId})`,
    );

    return log;
  } catch (error) {
    console.error(`❌ Failed to log validation error for ${visitId}:`, error);
    throw error;
  }
}

/**
 * Get pending validation issues grouped by visit
 */
export async function getPendingValidationIssues() {
  const logs = await prisma.taskValidationLog.findMany({
    where: {
      status: "PENDING",
    },
    orderBy: {
      detected_at: "desc",
    },
    select: {
      id: true,
      visit_id: true,
      actual_task_id: true,
      expected_task_id: true,
      missing_task_id: true,
      error_reason: true,
      detected_at: true,
      created_by: true,
      notes: true,
    },
  });

  // Group by visit_id
  const grouped: Record<
    string,
    {
      visit_id: string;
      issues: typeof logs;
      firstDetected: Date;
      lastDetected: Date;
      issueCount: number;
    }
  > = {};

  for (const log of logs) {
    if (!grouped[log.visit_id]) {
      grouped[log.visit_id] = {
        visit_id: log.visit_id,
        issues: [],
        firstDetected: log.detected_at,
        lastDetected: log.detected_at,
        issueCount: 0,
      };
    }

    grouped[log.visit_id].issues.push(log);
    grouped[log.visit_id].lastDetected = log.detected_at;
    grouped[log.visit_id].issueCount++;
  }

  return Object.values(grouped);
}

/**
 * Mark validation issue as resolved
 */
export async function resolveValidationIssue(logId: bigint, notes?: string) {
  const resolved = await prisma.taskValidationLog.update({
    where: {
      id: logId,
    },
    data: {
      status: "RESOLVED",
      resolved_at: new Date(),
      notes,
    },
  });

  console.log(`✅ Validation issue ${logId} marked as resolved`);
  return resolved;
}

/**
 * Mark validation issue as ignored (tidak perlu action)
 */
export async function ignoreValidationIssue(logId: bigint, notes?: string) {
  const ignored = await prisma.taskValidationLog.update({
    where: {
      id: logId,
    },
    data: {
      status: "IGNORED",
      resolved_at: new Date(),
      notes: notes || "Marked as ignored",
    },
  });

  console.log(`⏭️  Validation issue ${logId} marked as ignored`);
  return ignored;
}

import prisma from "../lib/prisma";

/**
 * Task validation error reasons
 */
export type TaskValidationReason =
  | "task_3_not_sent" // CHECKIN belum terkirim tapi sudah FINISH/CLOSE
  | "task_4_not_sent" // START belum terkirim tapi sudah FINISH/CLOSE
  | "task_3_missing" // Tidak ada record CHECKIN sama sekali
  | "task_4_missing" // Tidak ada record START sama sekali
  | "out_of_order" // Task diterima tidak urut
  | "unknown";

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

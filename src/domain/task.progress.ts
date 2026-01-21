/**
 * Helper untuk mengelola task_progress JSON field di VisitEvent
 * Format:
 * {
 *   "1": { status: "DRAFT" | "READY_BPJS" | "BLOCKED_BPJS" | "SENT_BPJS" | "FAILED_BPJS", blocked_reason?, sentAt?, failedReason? },
 *   "3": { status: "DRAFT" | "SENT_BPJS" | "FAILED_BPJS", sentAt?, failedReason? },
 *   ...
 * }
 */

export interface TaskProgress {
  // REGISTER (task_id=1): all states
  // Tasks 3/4/5: DRAFT, SENT_BPJS, FAILED_BPJS only
  status: "DRAFT" | "READY_BPJS" | "BLOCKED_BPJS" | "SENT_BPJS" | "FAILED_BPJS";
  blocked_reason?: string; // Only for REGISTER validation failures
  sentAt?: string; // When sent to BPJS
  failedReason?: string; // Why submission/validation failed
}

export interface TaskProgressMap {
  [taskId: string]: TaskProgress;
}

/**
 * Inisialisasi atau ambil task_progress dari JSON
 */
export function getTaskProgress(progressJson: any): TaskProgressMap {
  if (!progressJson) return {};
  if (typeof progressJson === "string") {
    return JSON.parse(progressJson);
  }
  return progressJson as TaskProgressMap;
}

/**
 * Update task progress untuk task_id tertentu
 */
export function updateTaskProgress(
  currentProgress: any,
  taskId: number,
  status: "DRAFT" | "READY_BPJS" | "BLOCKED_BPJS" | "SENT_BPJS" | "FAILED_BPJS",
  reason?: string,
): TaskProgressMap {
  const progress = getTaskProgress(currentProgress);

  progress[taskId.toString()] = {
    status,
    ...(status === "SENT_BPJS" && { sentAt: new Date().toISOString() }),
    ...(status === "BLOCKED_BPJS" &&
      taskId === 1 && { blocked_reason: reason }),
    ...(status === "FAILED_BPJS" && { failedReason: reason }),
  };

  return progress;
}

/**
 * Check apakah REGISTER sudah READY_BPJS (valid)
 */
export function isRegisterReady(currentProgress: any): boolean {
  const progress = getTaskProgress(currentProgress);
  return progress["1"]?.status === "READY_BPJS";
}

/**
 * Check apakah REGISTER sudah SENT_BPJS
 */
export function isRegisterSent(currentProgress: any): boolean {
  const progress = getTaskProgress(currentProgress);
  return progress["1"]?.status === "SENT_BPJS";
}

/**
 * Check apakah task sudah SENT_BPJS
 */
export function isTaskSent(currentProgress: any, taskId: number): boolean {
  const progress = getTaskProgress(currentProgress);
  return progress[taskId.toString()]?.status === "SENT_BPJS";
}

/**
 * Get task status
 */
export function getTaskStatus(
  currentProgress: any,
  taskId: number,
):
  | "DRAFT"
  | "READY_BPJS"
  | "BLOCKED_BPJS"
  | "SENT_BPJS"
  | "FAILED_BPJS"
  | undefined {
  const progress = getTaskProgress(currentProgress);
  return progress[taskId.toString()]?.status;
}

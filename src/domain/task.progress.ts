/**
 * Helper untuk mengelola task_progress JSON field di VisitEvent
 * Format: { "1": { status: "SENT_BPJS", sentAt: "2026-01-20T..." }, "3": { ... }, ... }
 */

export interface TaskProgress {
  status: "DRAFT" | "SENT_BPJS" | "FAILED_BPJS";
  sentAt?: string;
  failedReason?: string;
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
  status: "DRAFT" | "SENT_BPJS" | "FAILED_BPJS",
  failedReason?: string,
): TaskProgressMap {
  const progress = getTaskProgress(currentProgress);

  progress[taskId.toString()] = {
    status,
    sentAt: status === "SENT_BPJS" ? new Date().toISOString() : undefined,
    failedReason: failedReason ? failedReason : undefined,
  };

  return progress;
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
): "DRAFT" | "SENT_BPJS" | "FAILED_BPJS" | undefined {
  const progress = getTaskProgress(currentProgress);
  return progress[taskId.toString()]?.status;
}

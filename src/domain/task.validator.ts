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

  // Payload validation issues
  | "payload_kuota_missing" // Kuota tidak ada atau 0 di snapshot
  | "payload_jadwal_missing" // Jadwal dokter tidak ada di snapshot
  | "payload_invalid" // Payload incomplete or corrupt

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

  console.log(`✅ Validation issue ${logId} marked as ignored`);
  return ignored;
}

/**
 * Payload interface untuk payload snapshot di VisitEvent
 * Disimpan di database untuk tracking & rollback jika ada error
 */
export interface PayloadSnapshot {
  kd_dokter?: string;
  nama_dokter?: string;
  kd_poli?: string;
  nama_poli?: string;
  jam_praktek?: string; // Format: "HH:MM-HH:MM"
  kuota_jkn?: number;
  estimasi_dilayani?: number; // Unix timestamp
  tgl_registrasi?: string;
  jam_registrasi?: string;
  no_rkm_medis?: string;
  [key: string]: any;
}

/**
 * Log payload data untuk debugging
 * Menampilkan struktur data yang diterima dari KHANZA
 */
export function debugLogPayload(
  visitId: string,
  payload: Record<string, any> | null,
  context?: string,
): void {
  console.log(`\n📊 === PAYLOAD DEBUG (${context || "general"}) ===`);
  console.log(`Visit ID: ${visitId}`);

  if (!payload) {
    console.log("⚠️  Payload: NULL atau undefined");
    return;
  }

  console.log("Struktur Payload:", {
    kd_dokter: payload.kd_dokter,
    nama_dokter: payload.nama_dokter,
    kd_poli: payload.kd_poli,
    nama_poli: payload.nama_poli,
    jam_praktek: payload.jam_praktek,
    kuota_jkn: payload.kuota_jkn,
    estimasi_dilayani: payload.estimasi_dilayani,
    tgl_registrasi: payload.tgl_registrasi,
    jam_registrasi: payload.jam_registrasi,
    no_rkm_medis: payload.no_rkm_medis,
  });

  // Log semua field untuk debugging
  const allKeys = Object.keys(payload);
  if (allKeys.length > 10) {
    console.log(`📋 Total fields: ${allKeys.length}`);
    console.log("Semua fields:", allKeys);
  }

  console.log(`=== END PAYLOAD DEBUG ===\n`);
}

/**
 * Validate payload untuk REGISTER
 * Returns { isValid, reason } untuk block data jika payload invalid
 *
 * NOTE: Validasi LENIENT - data tetap dimasukkan ke VisitEvent walaupun payload imperfect
 * Hanya reject jika benar-benar tidak bisa diproses ke BPJS
 * - Kuota 0 tetap OK (queue penuh, tapi pasien bisa tunggu)
 * - Jadwal kosong tetap OK (fallback ke jadwal default)
 * - Estimasi 0 tetap OK (fallback ke waktu default)
 */
export function validatePayload(payload: Record<string, any> | null): {
  isValid: boolean;
  reason?: TaskValidationReason;
  errorMessage?: string;
} {
  // HANYA reject jika payload benar2 null (data tidak ada sama sekali)
  if (!payload || typeof payload !== "object") {
    return {
      isValid: false,
      reason: "payload_invalid",
      errorMessage:
        "Payload kosong/corrupt (tidak bisa mengakses data dari Khanza)",
    };
  }

  // Cek field-field kritis yang HARUS ada untuk BPJS
  // Jika ada minimal 1 field yang menunjukkan kuota/jadwal diambil, accept payload
  const hasValidKuota = typeof payload.kuota_jkn === "number";
  const hasValidJadwal = typeof payload.jam_praktek === "string";
  const hasValidEstimasi = typeof payload.estimasi_dilayani === "number";

  // Jika semua field penting tersedia (walaupun mungkin bernilai 0 atau kosong), accept
  if (hasValidKuota || hasValidJadwal || hasValidEstimasi) {
    return { isValid: true };
  }

  // Jika sedikit pun data ada, accept (kemungkinan fallback values)
  const hasAnySupportingData =
    payload.kd_dokter ||
    payload.kd_poli ||
    payload.tgl_registrasi ||
    payload.jam_registrasi;

  if (hasAnySupportingData) {
    return { isValid: true };
  }

  // Hanya reject jika benar2 payload kosong
  return {
    isValid: false,
    reason: "payload_invalid",
    errorMessage:
      "Payload tidak memiliki data apapun (kode poli/dokter/tanggal kosong)",
  };
}

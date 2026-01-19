/**
 * HFIS Validator Service
 * Validasi kode dokter dan poli dari snapshot BPJS
 */

import prisma from "../lib/prisma";

export interface ValidationResult {
  isValid: boolean;
  status: "READY_BPJS" | "BLOCKED_BPJS";
  blockedReason?: string;
}

/**
 * Validasi apakah dokter dan poli ada di snapshot HFIS untuk tanggal tertentu
 */
export async function validateHfisData(
  poliId: string,
  dokterId: string,
  tanggal: string,
): Promise<ValidationResult> {
  // Cek apakah ada jadwal untuk poli dan dokter ini di tanggal tersebut
  const schedule = await prisma.doctorScheduleQuota.findFirst({
    where: {
      poli_id: poliId,
      dokter_id: dokterId,
      tanggal: new Date(tanggal),
    },
  });

  if (!schedule) {
    return {
      isValid: false,
      status: "BLOCKED_BPJS",
      blockedReason: `Jadwal dokter ${dokterId} untuk poli ${poliId} pada ${tanggal} tidak ditemukan di snapshot HFIS. Periksa kode dokter/poli atau refresh snapshot.`,
    };
  }

  // Data valid
  return {
    isValid: true,
    status: "READY_BPJS",
  };
}

/**
 * Validasi data registrasi secara lengkap
 */
export interface RegistrationValidation {
  isValid: boolean;
  status: "DRAFT" | "READY_BPJS" | "BLOCKED_BPJS";
  blockedReason?: string;
}

export async function validateRegistration(
  poliId: string,
  dokterId: string,
  tanggal: string,
  noReg?: string,
  noRawat?: string,
): Promise<RegistrationValidation> {
  // Validasi field wajib
  if (!poliId || !dokterId || !tanggal || !noReg || !noRawat) {
    return {
      isValid: false,
      status: "DRAFT",
      blockedReason:
        "Data registrasi tidak lengkap (poli_id, dokter_id, tanggal, no_reg, no_rawat wajib diisi)",
    };
  }

  // Validasi terhadap HFIS
  const hfisValidation = await validateHfisData(poliId, dokterId, tanggal);

  if (!hfisValidation.isValid) {
    return {
      isValid: false,
      status: hfisValidation.status,
      blockedReason: hfisValidation.blockedReason,
    };
  }

  // Semua validasi passed
  return {
    isValid: true,
    status: "READY_BPJS",
  };
}

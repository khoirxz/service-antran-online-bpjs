/**
 * HFIS Validator Service
 * Validasi kode dokter dan poli dari snapshot BPJS
 * Dan mengambil data jadwal untuk payload
 */

import prisma from "../lib/prisma";
import { formatLocalDate } from "../utils/formatDate";
import { aggregateRegisterEventsByPoliDokterTanggal } from "../khanza/khanza.query";

export interface ValidationResult {
  isValid: boolean;
  status: "READY_BPJS" | "BLOCKED_BPJS";
  blockedReason?: string;
}

/**
 * Data jadwal dari HFIS yang sudah divalidasi
 */
export interface HfisScheduleData {
  poli_id: string;
  poli_name: string;
  dokter_id: string;
  dokter_name: string;
  tanggal: string;
  jam_mulai: string;
  jam_selesai: string;
  jam_praktek: string;
  kuota_jkn: number;
  total_registrasi: number;
  sisa_kuota_jkn: number;
  kuota_nonjkn: number;
  sisa_kuota_nonjkn: number;
}

/**
 * Hasil validasi dan data HFIS (gabungan validasi + data)
 */
export interface ValidationWithData {
  isValid: boolean;
  status: "DRAFT" | "READY_BPJS" | "BLOCKED_BPJS";
  blockedReason?: string;
  hfisData?: HfisScheduleData;
}

/**
 * Validasi apakah dokter dan poli ada di snapshot HFIS untuk tanggal tertentu
 */
export async function validateHfisData(
  poliId: string,
  dokterId: string,
  tanggal: string,
): Promise<ValidationResult> {
  // format tanggal
  const formattedDate = formatLocalDate(new Date(tanggal));
  // Cek apakah ada jadwal untuk poli dan dokter ini di tanggal tersebut
  const schedule = await prisma.doctorScheduleQuota.findFirst({
    where: {
      poli_id: poliId,
      dokter_id: dokterId,
      tanggal: new Date(formattedDate),
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
  // format tanggal
  const formattedDate = formatLocalDate(new Date(tanggal));

  // Validasi field wajib
  if (!poliId || !dokterId || !formattedDate || !noReg || !noRawat) {
    return {
      isValid: false,
      status: "DRAFT",
      blockedReason:
        "Data registrasi tidak lengkap (poli_id, dokter_id, tanggal, no_reg, no_rawat wajib diisi)",
    };
  }

  // Validasi terhadap HFIS
  const hfisValidation = await validateHfisData(
    poliId,
    dokterId,
    formattedDate,
  );

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

/**
 * Validasi dan ambil data HFIS dalam satu langkah
 * Menghindari duplikasi query ke DoctorScheduleQuota
 */
export async function validateAndGetHfisData(
  poliId: string,
  dokterId: string,
  tanggal: string,
  noReg?: string,
  noRawat?: string,
): Promise<ValidationWithData> {
  // debug
  console.log(
    `Validating HFIS data for poli: ${poliId}, dokter: ${dokterId}, tanggal: ${tanggal}, noReg: ${noReg}, noRawat: ${noRawat}`,
  );
  const formattedDate = formatLocalDate(new Date(tanggal));

  // Validasi field wajib
  if (!poliId || !dokterId || !formattedDate || !noReg || !noRawat) {
    return {
      isValid: false,
      status: "DRAFT",
      blockedReason:
        "Data registrasi tidak lengkap (poli_id, dokter_id, tanggal, no_reg, no_rawat wajib diisi)",
    };
  }

  // Cari jadwal di snapshot HFIS
  const schedule = await prisma.doctorScheduleQuota.findFirst({
    where: {
      poli_id: poliId,
      dokter_id: dokterId,
      tanggal: new Date(formattedDate),
    },
  });

  if (!schedule) {
    return {
      isValid: false,
      status: "BLOCKED_BPJS",
      blockedReason: `Jadwal dokter ${dokterId} untuk poli ${poliId} pada ${tanggal} tidak ditemukan di snapshot HFIS. Periksa kode dokter/poli atau refresh snapshot.`,
    };
  }

  // Hitung total registrasi dari Khanza untuk menghitung sisa kuota
  const registrasiData = await aggregateRegisterEventsByPoliDokterTanggal(
    formattedDate,
    poliId,
    dokterId,
  );

  const totalRegistrasi =
    registrasiData.length > 0 ? registrasiData[0].total_register : 0;

  // Hitung sisa kuota
  const sisaKuotaJkn = Math.max(0, schedule.kuota_jkn - totalRegistrasi);

  // Untuk non-JKN: 30% dari kuota JKN (policy rumah sakit)
  const kuotaNonJkn = Math.floor(schedule.kuota_jkn * 0.3);
  const sisaKuotaNonJkn = Math.max(0, kuotaNonJkn - totalRegistrasi);

  // Return data lengkap dari HFIS
  return {
    isValid: true,
    status: "READY_BPJS",
    hfisData: {
      poli_id: schedule.poli_id,
      poli_name: schedule.nama_poli,
      dokter_id: schedule.dokter_id,
      dokter_name: schedule.nama_dokter,
      tanggal: formattedDate,
      jam_mulai: schedule.jam_mulai,
      jam_selesai: schedule.jam_selesai,
      jam_praktek: `${schedule.jam_mulai}-${schedule.jam_selesai}`,
      kuota_jkn: schedule.kuota_jkn,
      total_registrasi: totalRegistrasi,
      sisa_kuota_jkn: sisaKuotaJkn,
      kuota_nonjkn: kuotaNonJkn,
      sisa_kuota_nonjkn: sisaKuotaNonJkn,
    },
  };
}

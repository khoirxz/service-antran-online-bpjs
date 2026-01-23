/**
 * HFIS Validator Service
 * Validasi kode dokter dan poli dari snapshot BPJS
 * Dan mengambil data jadwal untuk payload
 *
 * Fitur Auto-Fetch:
 * Jika snapshot tidak ditemukan, akan otomatis fetch dari Khanza
 * dan simpan ke database lokal (lazy loading)
 */

import prisma from "../lib/prisma";
import { formatLocalDate } from "../utils/formatDate";
import { aggregateRegisterEventsByPoliDokterTanggal } from "../khanza/khanza.query";
import { khanzaDb } from "../khanza/khanza.client";

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
 * Map hari dalam bahasa Indonesia ke day of week
 */
const HARI_MAP: Record<string, number> = {
  MINGGU: 0,
  SENIN: 1,
  SELASA: 2,
  RABU: 3,
  KAMIS: 4,
  JUMAT: 5,
  SABTU: 6,
};

/**
 * Auto-fetch jadwal dokter dari Khanza jika tidak ada di snapshot
 * Lazy loading - hanya fetch saat dibutuhkan
 */
async function autoFetchScheduleFromKhanza(
  poliId: string,
  dokterId: string,
  tanggal: string,
): Promise<boolean> {
  try {
    const targetDate = new Date(tanggal);
    const dayOfWeek = targetDate.getDay();

    // Cari hari kerja yang sesuai
    const hariKerja = Object.entries(HARI_MAP).find(
      ([_, dow]) => dow === dayOfWeek,
    )?.[0];

    if (!hariKerja) {
      console.log(`⚠️  Tidak bisa menentukan hari kerja untuk ${tanggal}`);
      return false;
    }

    // Query jadwal dari Khanza berdasarkan kode BPJS
    const [rows] = await khanzaDb.query(
      `
      SELECT 
        j.kd_dokter,
        mpd.kd_dokter_bpjs,
        mpd.nm_dokter_bpjs as nama_dokter,
        j.kd_poli,
        mp.kd_poli_bpjs,
        mp.nm_poli_bpjs as nama_poli,
        j.hari_kerja,
        j.jam_mulai,
        j.jam_selesai,
        j.kuota
      FROM jadwal j
      LEFT JOIN maping_dokter_dpjpvclaim mpd ON j.kd_dokter = mpd.kd_dokter
      LEFT JOIN maping_poli_bpjs mp ON j.kd_poli = mp.kd_poli_bpjs
      WHERE mpd.kd_dokter_bpjs = ?
      AND mp.kd_poli_bpjs = ?
      AND UPPER(j.hari_kerja) = ?
    `,
      [dokterId, poliId, hariKerja],
    );

    const jadwalList = rows as any[];

    if (jadwalList.length === 0) {
      console.log(
        `⚠️  Tidak ada jadwal di Khanza untuk dokter ${dokterId}, poli ${poliId}, hari ${hariKerja}`,
      );
      return false;
    }

    const now = new Date();

    // Simpan setiap jadwal yang ditemukan
    for (const jadwal of jadwalList) {
      const jamMulai = jadwal.jam_mulai || "08:00:00";
      const jamSelesai = jadwal.jam_selesai || "12:00:00";

      // Cek apakah sudah ada
      const existing = await prisma.doctorScheduleQuota.findFirst({
        where: {
          tanggal: targetDate,
          poli_id: poliId,
          dokter_id: dokterId,
          jam_mulai: jamMulai,
        },
      });

      if (!existing) {
        await prisma.doctorScheduleQuota.create({
          data: {
            tanggal: targetDate,
            poli_id: poliId,
            dokter_id: dokterId,
            nama_dokter: jadwal.nama_dokter || "Unknown",
            nama_poli: jadwal.nama_poli || "Unknown",
            jam_mulai: jamMulai,
            jam_selesai: jamSelesai,
            kuota_jkn: jadwal.kuota || 20,
            source: "AUTO_FETCH",
            fetchedAt: now,
          },
        });
        console.log(
          `✅ Auto-fetch: Jadwal ${poliId}/${dokterId} ${tanggal} ${jamMulai}-${jamSelesai} disimpan`,
        );
      }
    }

    return true;
  } catch (error: any) {
    console.error(`❌ Auto-fetch error: ${error.message}`);
    return false;
  }
}

/**
 * Cari jadwal di snapshot, jika tidak ada auto-fetch dari Khanza
 */
async function getOrFetchSchedule(
  poliId: string,
  dokterId: string,
  tanggal: string,
) {
  const formattedDate = formatLocalDate(new Date(tanggal));
  const targetDate = new Date(formattedDate);

  // Cari di snapshot lokal
  let schedule = await prisma.doctorScheduleQuota.findFirst({
    where: {
      poli_id: poliId,
      dokter_id: dokterId,
      tanggal: targetDate,
    },
  });

  // Jika tidak ada, coba auto-fetch dari Khanza
  if (!schedule) {
    console.log(
      `🔄 Snapshot tidak ditemukan untuk ${poliId}/${dokterId}/${formattedDate}, mencoba auto-fetch...`,
    );

    const fetched = await autoFetchScheduleFromKhanza(
      poliId,
      dokterId,
      formattedDate,
    );

    if (fetched) {
      // Coba cari lagi setelah fetch
      schedule = await prisma.doctorScheduleQuota.findFirst({
        where: {
          poli_id: poliId,
          dokter_id: dokterId,
          tanggal: targetDate,
        },
      });
    }
  }

  return schedule;
}

/**
 * Validasi apakah dokter dan poli ada di snapshot HFIS untuk tanggal tertentu
 * Dengan fitur auto-fetch jika snapshot tidak ada
 */
export async function validateHfisData(
  poliId: string,
  dokterId: string,
  tanggal: string,
): Promise<ValidationResult> {
  // format tanggal
  const formattedDate = formatLocalDate(new Date(tanggal));

  // Cek apakah ada jadwal (dengan auto-fetch jika tidak ada)
  const schedule = await getOrFetchSchedule(poliId, dokterId, formattedDate);

  if (!schedule) {
    return {
      isValid: false,
      status: "BLOCKED_BPJS",
      blockedReason: `Jadwal dokter ${dokterId} untuk poli ${poliId} pada ${tanggal} tidak ditemukan di Khanza. Periksa mapping kode BPJS di tabel maping_dokter_dpjpvclaim dan maping_poli_bpjs.`,
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
 * Dengan fitur auto-fetch jika snapshot tidak ada
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

  // Cari jadwal di snapshot HFIS (dengan auto-fetch jika tidak ada)
  const schedule = await getOrFetchSchedule(poliId, dokterId, formattedDate);

  if (!schedule) {
    return {
      isValid: false,
      status: "BLOCKED_BPJS",
      blockedReason: `Jadwal dokter ${dokterId} untuk poli ${poliId} pada ${tanggal} tidak ditemukan di Khanza. Periksa mapping kode BPJS di tabel maping_dokter_dpjpvclaim dan maping_poli_bpjs.`,
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
  // Format jam: "HH:MM:SS" -> "HH:MM"
  const jamMulaiFormatted = schedule.jam_mulai.substring(0, 5);
  const jamSelesaiFormatted = schedule.jam_selesai.substring(0, 5);

  return {
    isValid: true,
    status: "READY_BPJS",
    hfisData: {
      poli_id: schedule.poli_id,
      poli_name: schedule.nama_poli,
      dokter_id: schedule.dokter_id,
      dokter_name: schedule.nama_dokter,
      tanggal: formattedDate,
      jam_mulai: jamMulaiFormatted,
      jam_selesai: jamSelesaiFormatted,
      jam_praktek: `${jamMulaiFormatted}-${jamSelesaiFormatted}`,
      kuota_jkn: schedule.kuota_jkn,
      total_registrasi: totalRegistrasi,
      sisa_kuota_jkn: sisaKuotaJkn,
      kuota_nonjkn: kuotaNonJkn,
      sisa_kuota_nonjkn: sisaKuotaNonJkn,
    },
  };
}

/**
 * QuotaAggregator - Service untuk menghitung kuota real-time
 * Menggabungkan data dari:
 * 1. BPJS API (kapasitas jadwal dokter)
 * 2. Database lokal (jumlah registrasi yang sudah ada)
 */

import prisma from "../lib/prisma";
import { getJadwalDokter } from "../bpjs/bpjs.client";
import { aggregateRegisterEventsByPoliDokterTanggal } from "../khanza/khanza.query";

interface QuotaInfo {
  poli_id: string;
  poli_name: string;
  dokter_id: string;
  dokter_name: string;
  tanggal: string;
  jam_praktek: string;
  kuota_jkn: number;
  total_registrasi: number;
  sisa_kuota_jkn: number;
  kuota_nonjkn: number;
  sisa_kuota_nonjkn: number;
}

/**
 * Refresh snapshot jadwal dokter dari BPJS API
 * Dipanggil setiap pagi atau on-demand
 */
export async function refreshDoctorScheduleFromBpjs(
  kodePoli: string,
  tanggal: string,
) {
  try {
    const jadwalData: {
      kodesubspesialis: string;
      hari: number;
      kapasitaspasien: number;
      libur: number;
      namahari: string;
      jadwal: string; //Contoh: 15:00-17:00
      namasubspesialis: string;
      namadokter: string;
      kodepoli: string;
      namapoli: string;
      kodedokter: number;
    }[] = await getJadwalDokter(kodePoli, tanggal);

    if (!jadwalData || jadwalData.length === 0) {
      console.warn(`Tidak ada jadwal untuk poli ${kodePoli} pada ${tanggal}`);
      return;
    }

    for (const jadwal of jadwalData) {
      await prisma.doctorScheduleQuota.upsert({
        where: {
          poli_id_dokter_id_tanggal_jam_mulai: {
            poli_id: jadwal.kodepoli,
            dokter_id: jadwal.kodedokter.toString(),
            tanggal: new Date(tanggal),
            jam_mulai: jadwal.jadwal.split(" - ")[0],
          },
        },
        create: {
          dokter_id: jadwal.kodedokter.toString(),
          poli_id: jadwal.kodepoli,
          tanggal: new Date(tanggal),
          jam_mulai: jadwal.jadwal.split("-")[0],
          jam_selesai: jadwal.jadwal.split("-")[1],
          kuota_jkn: jadwal.kapasitaspasien,
          source: "BPJS_HFIS",
          fetchedAt: new Date(),
        },
        update: {
          jam_selesai: jadwal.jadwal.split("-")[1],
          kuota_jkn: jadwal.kapasitaspasien,
          fetchedAt: new Date(),
        },
      });
    }

    console.log(
      `✅ Berhasil refresh jadwal poli ${kodePoli} tanggal ${tanggal}`,
    );
  } catch (error) {
    console.error(
      `❌ Gagal refresh jadwal poli ${kodePoli} tanggal ${tanggal}:`,
      error,
    );
    throw error;
  }
}

/**
 * Hitung kuota real-time untuk poli/dokter/tanggal tertentu
 * Menggabungkan data snapshot BPJS + registrasi lokal
 */
export async function calculateQuota(
  poliId: string,
  dokterId: string,
  tanggal: string,
): Promise<QuotaInfo | null> {
  // 1. Ambil snapshot jadwal dari database lokal (hasil sync BPJS)
  const schedule = await prisma.doctorScheduleQuota.findFirst({
    where: {
      poli_id: poliId,
      dokter_id: dokterId,
      tanggal: new Date(tanggal),
    },
  });

  if (!schedule) {
    console.warn(
      `Snapshot jadwal tidak ditemukan untuk poli ${poliId}, dokter ${dokterId}, tanggal ${tanggal}`,
    );
    return null;
  }

  // 2. Hitung total registrasi dari database Khanza
  const registrasiData = await aggregateRegisterEventsByPoliDokterTanggal(
    tanggal,
    poliId,
    dokterId,
  );

  const totalRegistrasi =
    registrasiData.length > 0 ? registrasiData[0].total_register : 0;

  // 3. Hitung sisa kuota
  const sisaKuotaJkn = Math.max(0, schedule.kuota_jkn - totalRegistrasi);

  // Untuk non-JKN, bisa disesuaikan policy rumah sakit
  // Misal: 30% dari kuota JKN atau 0 jika memang tidak ada kuota non-JKN
  const kuotaNonJkn = Math.floor(schedule.kuota_jkn * 0.3);
  const sisaKuotaNonJkn = Math.max(0, kuotaNonJkn - totalRegistrasi);

  return {
    poli_id: schedule.poli_id,
    poli_name: registrasiData[0]?.nama_poli || "",
    dokter_id: schedule.dokter_id,
    dokter_name: "", // Bisa di-join dari tabel lain jika perlu
    tanggal: schedule.tanggal.toISOString().slice(0, 10),
    jam_praktek: `${schedule.jam_mulai}-${schedule.jam_selesai}`,
    kuota_jkn: schedule.kuota_jkn,
    total_registrasi: totalRegistrasi,
    sisa_kuota_jkn: sisaKuotaJkn,
    kuota_nonjkn: kuotaNonJkn,
    sisa_kuota_nonjkn: sisaKuotaNonJkn,
  };
}

/**
 * Hitung estimasi waktu dilayani
 * Formula: jam_praktek_mulai + (nomor_antrean * 6 menit)
 */
export function calculateEstimatedTime(
  tanggal: string,
  jamMulai: string,
  nomorAntrean: number,
): number {
  const [hours, minutes] = jamMulai.split(":").map(Number);
  const date = new Date(tanggal);
  date.setHours(hours, minutes, 0, 0);

  // Tambah 6 menit per antrean
  date.setMinutes(date.getMinutes() + nomorAntrean * 6);

  return date.getTime();
}

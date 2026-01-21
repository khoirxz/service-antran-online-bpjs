/**
 * QuotaAggregator - Service untuk menghitung kuota real-time
 * Menggabungkan data dari:
 * 1. BPJS API (kapasitas jadwal dokter)
 * 2. Database lokal (jumlah registrasi yang sudah ada)
 *
 * Optimization: Request deduplication + async background refresh
 */

import prisma from "../lib/prisma";
import { getJadwalDokter } from "../bpjs/bpjs.client";
import { aggregateRegisterEventsByPoliDokterTanggal } from "../khanza/khanza.query";
import {
  getRefreshLock,
  setRefreshLock,
  completeRefreshLock,
  setRefreshError,
  isCircuitOpen,
} from "./schedule.cache";

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
          nama_dokter: jadwal.namadokter,
          nama_poli: jadwal.namapoli,
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
 *
 * Optimization: Deduplication + async background refresh
 */
export async function calculateQuota(
  poliId: string,
  dokterId: string,
  tanggal: string,
): Promise<QuotaInfo | null> {
  // 1. Ambil snapshot jadwal dari database lokal (hasil sync BPJS)
  let schedule = await prisma.doctorScheduleQuota.findFirst({
    where: {
      poli_id: poliId,
      dokter_id: dokterId,
      tanggal: new Date(tanggal),
    },
  });

  // 2. Jika schedule tidak ada, cek apakah sudah ada refresh lock (deduplication)
  if (!schedule) {
    const refreshLock = getRefreshLock(poliId, tanggal);

    // 2a. Jika circuit open (recent error), gunakan last-known schedule
    if (isCircuitOpen(poliId, tanggal)) {
      console.warn(
        `⚠️  Circuit breaker open untuk poli ${poliId} tanggal ${tanggal}, menggunakan last-known schedule`,
      );
      const lastKnown = await getLastKnownSchedule(poliId, dokterId, tanggal);
      if (lastKnown) {
        schedule = lastKnown;
      }
    }
    // 2b. Jika sudah ada refresh in-flight, tunggu sebentar (deduplication)
    else if (refreshLock?.refreshing) {
      console.log(
        `🔄 Refresh sedang berjalan untuk poli ${poliId} tanggal ${tanggal}, menunggu...`,
      );
      // Tunggu max 3 detik untuk refresh selesai
      const startWait = Date.now();
      while (Date.now() - startWait < 3000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        schedule = await prisma.doctorScheduleQuota.findFirst({
          where: {
            poli_id: poliId,
            dokter_id: dokterId,
            tanggal: new Date(tanggal),
          },
        });
        if (schedule) break;
      }
    }
    // 2c. Refresh not in progress, trigger async refresh (non-blocking)
    else {
      console.log(
        `📡 Jadwal tidak ditemukan untuk poli ${poliId} tanggal ${tanggal}, refresh async...`,
      );
      triggerRefreshAsync(poliId, tanggal).catch((err) => {
        console.error(`Async refresh error untuk poli ${poliId}:`, err);
      });

      // Fallback ke last-known schedule
      const lastKnown = await getLastKnownSchedule(poliId, dokterId, tanggal);
      if (lastKnown) {
        schedule = lastKnown;
      } else {
        return null;
      }
    }
  }

  if (!schedule) {
    console.warn(
      `Snapshot jadwal tidak ditemukan dan no fallback untuk poli ${poliId}, dokter ${dokterId}, tanggal ${tanggal}`,
    );
    return null;
  }

  // 3. Hitung total registrasi dari database Khanza
  const registrasiData = await aggregateRegisterEventsByPoliDokterTanggal(
    tanggal,
    poliId,
    dokterId,
  );

  const totalRegistrasi =
    registrasiData.length > 0 ? registrasiData[0].total_register : 0;

  // 4. Hitung sisa kuota
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
/**
 * Trigger async background refresh (non-blocking)
 * Tidak menunggu hasil, refresh berjalan di background
 */
export async function triggerRefreshAsync(
  kodePoli: string,
  tanggal: string,
): Promise<void> {
  // Cek apakah sudah ada refresh in-flight (deduplication)
  const existingLock = getRefreshLock(kodePoli, tanggal);
  if (existingLock?.refreshing) {
    console.log(`🔄 Refresh sudah in-flight untuk ${kodePoli}:${tanggal}`);
    return;
  }

  // Set refresh lock sebelum trigger async
  setRefreshLock(kodePoli, tanggal);

  // Fire and forget - jangan await
  (async () => {
    try {
      await refreshDoctorScheduleFromBpjs(kodePoli, tanggal);
      completeRefreshLock(kodePoli, tanggal);
    } catch (error) {
      setRefreshError(kodePoli, tanggal, error as Error);
    }
  })();
}

/**
 * Get last-known schedule untuk fallback when BPJS is down
 * Mencari schedule terbaru yang pernah disync untuk poli/dokter
 */
export async function getLastKnownSchedule(
  poliId: string,
  dokterId: string,
  tanggal: string,
) {
  // Cari schedule terdekat sebelum atau sesudah tanggal target
  const schedules = await prisma.doctorScheduleQuota.findMany({
    where: {
      poli_id: poliId,
      dokter_id: dokterId,
      // Cari dalam window ±7 hari
      tanggal: {
        gte: new Date(new Date(tanggal).getTime() - 7 * 24 * 60 * 60 * 1000),
        lte: new Date(new Date(tanggal).getTime() + 7 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: {
      tanggal: "desc",
    },
    take: 1,
  });

  if (schedules.length > 0) {
    console.log(
      `📦 Menggunakan last-known schedule dari ${schedules[0].tanggal.toISOString().slice(0, 10)} untuk fallback`,
    );
    // Override tanggal agar cocok dengan request
    return {
      ...schedules[0],
      tanggal: new Date(tanggal),
    };
  }

  return null;
}

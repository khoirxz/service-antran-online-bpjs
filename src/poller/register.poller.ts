/**
 * Poller berfungsi sebagai proses background yang secara berkala
 * mengambil data dari sistem eksternal (Khanza) dan menyimpannya
 * ke dalam database lokal menggunakan Prisma ORM.
 *
 * File ini khusus menangani polling untuk event pendaftaran pasien (REGISTER).
 */
import { Prisma } from "@prisma/client";
import { fetchRegisterEvents } from "../khanza/khanza.query";
import prisma from "../lib/prisma";
import { getPollingState, updatePollingState } from "../storage/polling.state";
import {
  calculateQuota,
  calculateEstimatedTime,
} from "../domain/quota.aggregator";
import { validateRegistration } from "../domain/hfis.validator";
import {
  formatLocalDate,
  createUtcDateFromLocalDateString,
  createUtcDateTimeFromLocal,
} from "../utils/formatDate";

export async function pollRegisterEvents() {
  const state = await getPollingState("REGISTER");

  // ambil jam dari state dan pecah menjadi yyyy-mm-dd dan HH:MM:SS
  const lastDate = state?.last_event_time?.toISOString().slice(0, 10);
  const lastTime = state?.last_event_time?.toTimeString().slice(0, 8);

  const rows = await fetchRegisterEvents(
    lastDate || "2000-01-01",
    lastTime || "00:00:00",
  );

  let maxEventTime = state?.last_event_time;

  for (const row of rows) {
    // Format tanggal lokal tanpa konversi timezone
    const tgl_registrasi = formatLocalDate(new Date(row.tgl_registrasi));

    // Simpan event_time sebagai UTC dengan jam-menit lokal agar tidak bergeser
    const event_time = createUtcDateTimeFromLocal(
      tgl_registrasi,
      row.jam_registrasi,
    );

    // Simpan tanggal sebagai UTC midnight agar tidak bergeser mundur saat insert
    const tanggal = createUtcDateFromLocalDateString(tgl_registrasi);

    console.log("Memproses event register untuk:", event_time, row.no_rawat);

    // skip jika terdapat anomali
    if (event_time <= state?.last_event_time!) continue;

    try {
      // 1. Validasi data terhadap HFIS
      const validation = await validateRegistration(
        row.kd_poli,
        row.kd_dokter,
        tgl_registrasi,
        row.no_reg,
        row.no_rawat,
      );

      // 2. Jika valid, hitung kuota dan estimasi
      let quotaInfo = null;
      let estimasiUnix = 0;

      if (validation.isValid) {
        quotaInfo = await calculateQuota(
          row.kd_poli,
          row.kd_dokter,
          tgl_registrasi,
        );

        // Hitung estimasi waktu dilayani
        const angkaAntrean = parseInt(row.no_reg, 10);
        const jamMulai = row.jam_mulai.slice(0, 5);
        estimasiUnix = calculateEstimatedTime(
          tgl_registrasi,
          jamMulai,
          angkaAntrean,
        );
      }

      // 3. Build payload (hanya jika valid)
      const payload = quotaInfo
        ? {
            kuota_jkn: quotaInfo.kuota_jkn,
            sisa_kuota_jkn: quotaInfo.sisa_kuota_jkn,
            kuota_nonjkn: quotaInfo.kuota_nonjkn,
            sisa_kuota_nonjkn: quotaInfo.sisa_kuota_nonjkn,
            estimasi_dilayani: estimasiUnix,
            jam_praktek: quotaInfo.jam_praktek,
            no_rm: row.no_rkm_medis,
            jeniskunjungan: row.jenis_kunjungan,
          }
        : Prisma.JsonNull;

      // 4. Create event dengan status berdasarkan validasi
      const angkaAntrean = parseInt(row.no_reg, 10);

      await prisma.visitEvent.create({
        data: {
          visit_id: row.no_rawat,
          event_time: event_time,

          tanggal: tanggal,
          jam_registrasi: row.jam_registrasi,

          poli_id: row.kd_poli,
          dokter_id: row.kd_dokter,

          nomor_antrean: row.no_reg,
          angka_antrean: angkaAntrean,

          is_jkn: true,

          // Set status berdasarkan hasil validasi
          status: validation.status,
          blocked_reason: validation.blockedReason,

          payload: payload as Prisma.NullableJsonNullValueInput,
        },
      });

      if (validation.isValid) {
        console.log(
          `✅ Event register ${row.no_rawat} READY_BPJS - kuota: JKN=${quotaInfo?.sisa_kuota_jkn}/${quotaInfo?.kuota_jkn}`,
        );
      } else {
        console.warn(
          `⚠️  Event register ${row.no_rawat} ${validation.status} - ${validation.blockedReason}`,
        );
      }
    } catch (error: any) {
      if (error.code !== "P2002") {
        console.error("Gagal menyimpan event register:", error);
      }

      if (event_time > maxEventTime!) {
        maxEventTime = event_time;
      }
    }
  }

  // update watermark
  if (maxEventTime! > state?.last_event_time!) {
    await updatePollingState("REGISTER", maxEventTime!);
  }
}

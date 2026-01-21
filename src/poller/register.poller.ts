import { Prisma } from "@prisma/client";
import { fetchRegisterEvents } from "../khanza/khanza.query";
import prisma from "../lib/prisma";
import {
  getPollingState,
  getPollingStateBatchCursor,
  updateBatchCursor,
  commitBatchCursor,
  rollbackBatchCursor,
} from "../storage/polling.state";
import {
  calculateQuota,
  calculateEstimatedTime,
} from "../domain/quota.aggregator";
import { validateRegistration } from "../domain/hfis.validator";
import { updateTaskProgress } from "../domain/task.progress";
import {
  formatLocalDate,
  createUtcDateFromLocalDateString,
  createUtcDateTimeFromLocal,
} from "../utils/formatDate";

export async function pollRegisterEvents() {
  const source = "REGISTER";
  const state = await getPollingState(source);

  let batchNumber = 0;
  let totalProcessed = 0;

  try {
    while (true) {
      // Get current cursor dari batch state
      const { cursor } = await getPollingStateBatchCursor(source);

      // Extract date dan time dari cursor
      const lastDate = cursor.slice(0, 10); // YYYY-MM-DD
      const lastTime = cursor.slice(11, 19); // HH:MM:SS

      // Fetch batch 100 records
      const rows = await fetchRegisterEvents(lastDate, lastTime);

      if (rows.length === 0) {
        console.log(
          `✅ [REGISTER] Finished: ${batchNumber} batches, ${totalProcessed} total events`,
        );
        return;
      }

      batchNumber++;
      let batchMaxEventTime = new Date(cursor.replace(" ", "T") + "Z");

      console.log(
        `📦 [REGISTER] Starting batch ${batchNumber} with ${rows.length} records from cursor: ${cursor}`,
      );

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

        // Track max event time dalam batch
        if (event_time > batchMaxEventTime) {
          batchMaxEventTime = event_time;
        }

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

          // 3. Build payload snapshot (kuota + estimasi dari polling time)
          const payload = quotaInfo
            ? {
                kuota_jkn: quotaInfo.kuota_jkn,
                sisa_kuota_jkn: quotaInfo.sisa_kuota_jkn,
                kuota_nonjkn: quotaInfo.kuota_nonjkn,
                sisa_kuota_nonjkn: quotaInfo.sisa_kuota_nonjkn,
                estimasi_dilayani: estimasiUnix,
                jam_praktek: quotaInfo.jam_praktek,
              }
            : Prisma.JsonNull;

          // 4. Create event dengan task_progress berdasarkan validasi
          const angkaAntrean = parseInt(row.no_reg, 10);

          // Buat task_progress untuk REGISTER dengan status hasil validasi
          const taskProgress = updateTaskProgress(
            {},
            1,
            validation.status as any,
            validation.blockedReason,
          );

          await prisma.visitEvent.create({
            data: {
              visit_id: row.no_rawat,
              event_time: event_time,

              tanggal: tanggal,
              jam_registrasi: row.jam_registrasi,

              poli_id: row.kd_poli,
              dokter_id: row.kd_dokter,
              no_rkm_medis: row.no_rkm_medis,

              nomor_antrean: row.no_reg,
              angka_antrean: angkaAntrean,

              is_jkn: true,

              payload: payload as Prisma.NullableJsonNullValueInput,
              task_progress: taskProgress as any,
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

          totalProcessed++;
        } catch (error: any) {
          if (error.code !== "P2002") {
            console.error(`❌ Error processing ${row.no_rawat}:`, error);
          }
        }
      }

      // Update batch cursor (track pending batch)
      const cursorStr = batchMaxEventTime
        .toISOString()
        .replace("T", " ")
        .substring(0, 19);
      await updateBatchCursor(source, cursorStr);

      console.log(
        `✅ [REGISTER] Batch ${batchNumber} completed: ${rows.length} events, new cursor: ${cursorStr}`,
      );

      // Small delay to avoid overloading DB
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  } catch (error) {
    console.error(`❌ [REGISTER] Error in batch ${batchNumber}:`, error);
    // Rollback pending cursor on error
    await rollbackBatchCursor(source);
  } finally {
    // Commit progress: move pending_cursor to last_event_time
    await commitBatchCursor(source);
  }
}

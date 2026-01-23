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
import { calculateEstimatedTime } from "../domain/quota.aggregator";
import { validateAndGetHfisData } from "../domain/hfis.validator";
import { updateTaskProgress } from "../domain/task.progress";
import {
  validatePayload,
  logTaskValidationError,
  debugLogPayload,
} from "../domain/task.validator";
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

        // VALIDASI: Registrasi tidak boleh di tanggal masa depan
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Set ke midnight hari ini
        const registrasiDate = new Date(tanggal);
        registrasiDate.setHours(0, 0, 0, 0); // Set ke midnight tanggal registrasi

        if (registrasiDate > today) {
          console.log(
            `⏭️  Skip ${row.no_rawat} - registrasi tanggal ${tgl_registrasi} (hari ini: ${formatLocalDate(today)})`,
          );
          continue;
        }

        // Track max event time dalam batch
        if (event_time > batchMaxEventTime) {
          batchMaxEventTime = event_time;
        }

        try {
          // 1. Validasi data terhadap HFIS DAN ambil data jadwal dalam satu langkah
          const validation = await validateAndGetHfisData(
            row.kd_poli,
            row.kd_dokter,
            tgl_registrasi,
            row.no_reg,
            row.no_rawat,
          );

          // 2. Hitung estimasi waktu dilayani menggunakan data dari HFIS
          let estimasiUnix = 0;
          const angkaAntrean = parseInt(row.no_reg, 10);

          if (validation.hfisData) {
            // Gunakan jam_mulai dari HFIS (source of truth)
            estimasiUnix = calculateEstimatedTime(
              tgl_registrasi,
              validation.hfisData.jam_mulai,
              angkaAntrean,
            );
          }

          // 3. Build payload snapshot dari data HFIS (jika valid)
          const payload = {
            kuota_jkn: validation.hfisData?.kuota_jkn ?? 0,
            sisa_kuota_jkn: validation.hfisData?.sisa_kuota_jkn ?? 0,
            kuota_nonjkn: validation.hfisData?.kuota_nonjkn ?? 0,
            sisa_kuota_nonjkn: validation.hfisData?.sisa_kuota_nonjkn ?? 0,
            estimasi_dilayani: estimasiUnix,
            jam_praktek: validation.hfisData?.jam_praktek ?? "",
          };

          debugLogPayload(
            row.no_rawat,
            payload,
            `REGISTER_${row.kd_poli}_${row.kd_dokter}`,
          );

          // 4. Validasi payload
          const payloadValidation = validatePayload(payload);
          if (!payloadValidation.isValid) {
            console.warn(
              `⚠️  Event register ${row.no_rawat} payload invalid: ${payloadValidation.errorMessage}`,
            );
            debugLogPayload(row.no_rawat, payload, "VALIDATION_FAILED");

            // Check jika sudah pernah di-log dan di-resolve
            // Jika sudah di-resolve, arti admin sudah fix masalah → try create VisitEvent
            const existingLog = await prisma.taskValidationLog.findFirst({
              where: {
                visit_id: row.no_rawat,
                error_reason: payloadValidation.reason,
              },
              orderBy: { createdAt: "desc" },
              take: 1,
            });

            if (existingLog?.status === "RESOLVED") {
              // Log sudah di-resolve, lanjutkan create VisitEvent
              console.log(
                `✅ Event ${row.no_rawat} error was resolved, proceeding to create VisitEvent`,
              );
            } else if (existingLog?.status === "PENDING") {
              // Masih PENDING, jangan log duplikat
              console.log(
                `⏭️  Event ${row.no_rawat} sudah di-log dengan error yang sama (PENDING), skip`,
              );
              totalProcessed++;
              continue;
            } else {
              // Belum pernah di-log, log sekarang
              await logTaskValidationError(
                row.no_rawat,
                1,
                null,
                null,
                payloadValidation.reason || "payload_invalid",
                undefined,
                payloadValidation.errorMessage,
              );

              totalProcessed++;
              continue;
            }
          }

          // 5. Create event dengan task_progress berdasarkan validasi

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

              payload: payload as any,
              task_progress: taskProgress as any,
            },
          });

          if (validation.isValid && validation.hfisData) {
            console.log(
              `✅ Event register ${row.no_rawat} READY_BPJS - kuota: JKN=${validation.hfisData.sisa_kuota_jkn}/${validation.hfisData.kuota_jkn}, jam: ${validation.hfisData.jam_praktek}`,
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

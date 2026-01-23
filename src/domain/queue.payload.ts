/**
 * Builder untuk payload yang akan dikirim ke BPJS API
 * Mengkonversi VisitEvent dari database ke format BPJS
 */

import { VisitEvent } from "@prisma/client";
import prisma from "../lib/prisma";
import { getTaskEventTime } from "./task.progress";

interface RegisterPayload {
  kodebooking: string;
  jenispasien: "JKN" | "NON JKN";
  nomorkartu: string;
  nik: string;
  nohp: string;
  kodepoli: string;
  namapoli: string;
  pasienbaru: 0 | 1;
  norm: string;
  tanggalperiksa: string;
  kodedokter: number; // BPJS expects number, not string
  namadokter: string;
  jampraktek: string;
  jeniskunjungan: number;
  nomorreferensi: string;
  nomorantrean: string;
  angkaantrean: number;
  estimasidilayani: number;
  sisakuotajkn: number;
  kuotajkn: number;
  sisakuotanonjkn: number;
  kuotanonjkn: number;
  keterangan: string;
}

/**
 * Build REGISTER payload dari VisitEvent
 * Task ID 1 = REGISTER
 *
 * Strategy:
 * 1. Use no_rkm_medis from event (essential data from SIMRS)
 * 2. Use payload snapshot (kuota + jadwal dari polling time)
 * 3. Fetch jenis_kunjungan from HFIS if not in payload
 */
export async function buildRegisterPayload(
  event: VisitEvent,
): Promise<RegisterPayload> {
  // Ambil data poli dari database
  const poli = await prisma.poli.findUnique({
    where: { poli_id: event.poli_id },
  });

  // Ambil data SnapshotQuota untuk dokter dan informasi kuota
  const snapshot = await prisma.doctorScheduleQuota.findFirst({
    where: {
      poli_id: event.poli_id,
      dokter_id: event.dokter_id,
      tanggal: event.tanggal,
    },
  });

  if (!poli) {
    throw new Error(`Poli ${event.poli_id} tidak ditemukan di database`);
  }

  // Ambil quota info dari payload snapshot (saved during polling)
  const payloadData = event.payload as Record<string, any>;

  // Prioritas jampraktek:
  // 1. Dari payload (hasil polling dengan HFIS)
  // 2. Dari snapshot DoctorScheduleQuota
  // Format: HH:MM-HH:MM (tanpa detik)
  let jampraktek = payloadData?.jam_praktek || "";

  if (!jampraktek && snapshot) {
    // Format jam dari snapshot: "HH:MM:SS" -> "HH:MM"
    const jamMulai = snapshot.jam_mulai.substring(0, 5);
    const jamSelesai = snapshot.jam_selesai.substring(0, 5);
    jampraktek = `${jamMulai}-${jamSelesai}`;
  }

  // Pastikan format tanpa detik (HH:MM-HH:MM)
  if (jampraktek && jampraktek.includes(":") && jampraktek.length > 11) {
    // Format "HH:MM:SS-HH:MM:SS" -> "HH:MM-HH:MM"
    const parts = jampraktek.split("-");
    if (parts.length === 2) {
      jampraktek = `${parts[0].substring(0, 5)}-${parts[1].substring(0, 5)}`;
    }
  }

  // Validasi: jampraktek wajib ada
  if (!jampraktek) {
    throw new Error(
      `Data jadwal tidak ditemukan untuk poli ${event.poli_id}, dokter ${event.dokter_id}, tanggal ${event.tanggal.toISOString().slice(0, 10)}. Pastikan snapshot HFIS sudah di-sync.`,
    );
  }

  // Konversi kodedokter ke number (BPJS requirement)
  const kodedokterStr = snapshot ? snapshot.dokter_id : event.dokter_id;
  const kodedokter = parseInt(kodedokterStr, 10);

  if (isNaN(kodedokter)) {
    throw new Error(
      `Kode dokter "${kodedokterStr}" tidak valid (harus berupa angka)`,
    );
  }

  // Build payload
  return {
    kodebooking: event.visit_id,
    jenispasien: "NON JKN", // Pasien JKN sudah terdaftar melalui sistem BPJS langsung (MJKN)
    nomorkartu: "-", // TODO: ambil dari Khanza pasien
    nik: "-", // TODO: ambil dari Khanza pasien
    nohp: "-", // TODO: ambil dari Khanza pasien
    kodepoli: event.poli_id,
    namapoli: poli.nama,
    pasienbaru: 0, // TODO: ambil dari Khanza
    norm: event.no_rkm_medis ?? "-", // Essential data from SIMRS
    tanggalperiksa: event.tanggal.toISOString().slice(0, 10),
    kodedokter, // number, bukan string
    namadokter: snapshot ? snapshot.nama_dokter : "-",
    jampraktek,
    jeniskunjungan: payloadData?.jeniskunjungan ?? 3, // TODO: fetch from HFIS if needed
    nomorreferensi: "",
    nomorantrean: event.nomor_antrean ?? "",
    angkaantrean: event.angka_antrean ?? 0,
    estimasidilayani: payloadData?.estimasi_dilayani ?? 0, // Unix timestamp from polling
    sisakuotajkn: payloadData?.sisa_kuota_jkn ?? 0,
    kuotajkn: payloadData?.kuota_jkn ?? 0,
    sisakuotanonjkn:
      payloadData?.sisa_kuota_nonjkn ?? payloadData?.sisa_kuota_jkn ?? 0,
    kuotanonjkn: payloadData?.kuota_nonjkn ?? payloadData?.kuota_jkn ?? 0,
    keterangan: "Harap hadir 30 menit lebih awal",
  };
}

/**
 * Build UPDATE payload untuk task 3, 4, 5, 6, 7
 *
 * Task payload sederhana:
 * - Task 3 (CHECKIN): pasien tiba di poli
 * - Task 4 (START): dokter mulai periksa
 * - Task 5 (FINISH): dokter selesai periksa
 * - Task 6 (PHARMACY_STARTED): mulai farmasi buat obat
 * - Task 7 (CLOSE): obat selesai dibuat
 *
 * Format sama untuk semua: kodebooking + taskid + waktu (timestamp millisecond)
 * Waktu diambil dari task_progress[taskId].event_time (waktu task dari Khanza)
 */
export async function buildTaskUpdatePayload(
  event: VisitEvent,
  taskid: number,
): Promise<{
  kodebooking: string;
  taskid: number;
  waktu: number;
}> {
  // Ambil event_time dari task_progress (waktu task dari Khanza)
  const taskEventTimeStr = getTaskEventTime(event.task_progress, taskid);

  let waktu: number;
  if (taskEventTimeStr) {
    // Gunakan waktu task yang sudah disimpan di task_progress
    waktu = new Date(taskEventTimeStr).getTime();
  } else {
    // Fallback ke event_time (waktu registrasi) jika event_time task tidak ada
    console.warn(
      `⚠️  Task ${taskid} untuk ${event.visit_id} tidak memiliki event_time, fallback ke waktu registrasi`,
    );
    waktu = event.event_time.getTime();
  }

  return {
    kodebooking: event.visit_id,
    taskid,
    waktu,
  };
}

/**
 * Builder untuk payload yang akan dikirim ke BPJS API
 * Mengkonversi VisitEvent dari database ke format BPJS
 */

import { VisitEvent } from "@prisma/client";
import prisma from "../lib/prisma";

interface RegisterPayload {
  kodebooking: string;
  jenispasien: "NON JKN";
  nomorkartu: string | null;
  nik: string | null;
  nohp: string | null;
  kodepoli: string;
  namapoli: string;
  pasienbaru: 0 | 1;
  norm: string | null;
  tanggalperiksa: string;
  kodedokter: string;
  namadokter: string | null;
  jampraktek: string | null;
  jeniskunjungan: number;
  nomorreferensi: string;
  nomorantrean: string | null;
  angkaantrean: number | null;
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

  // Ambil quota info dari payload JSON
  const payloadData = event.payload as Record<string, any>;

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
    norm: payloadData?.norm ?? "-", // TODO: ambil dari Khanza
    tanggalperiksa: event.tanggal.toISOString().slice(0, 10),
    kodedokter: snapshot ? snapshot.dokter_id : event.dokter_id,
    namadokter: snapshot ? snapshot.nama_dokter : "-",
    jampraktek: snapshot
      ? `${snapshot.jam_mulai ?? ""}-${snapshot.jam_selesai ?? ""}`
      : "", // Dari HFIS snapshot
    jeniskunjungan: payloadData?.jeniskunjungan ?? 3, // Dari payload
    nomorreferensi: "",
    nomorantrean: event.nomor_antrean ?? "",
    angkaantrean: event.angka_antrean ?? 0,
    estimasidilayani: payloadData?.estimasi_dilayani ?? 0, // Unix timestamp
    sisakuotajkn: payloadData?.sisa_kuota_jkn ?? 0,
    kuotajkn: payloadData?.kuota_jkn ?? 0,
    sisakuotanonjkn: payloadData?.sisa_kuota_nonjkn ?? 0,
    kuotanonjkn: payloadData?.kuota_nonjkn ?? 0,
    keterangan: "Harap hadir 30 menit lebih awal",
  };
}

/**
 * Build UPDATE payload untuk task 3, 4, 5
 */
export async function buildTaskUpdatePayload(
  event: VisitEvent,
  taskid: number,
): Promise<{
  kodebooking: string;
  taskid: number;
  waktu: number;
}> {
  return {
    kodebooking: event.visit_id,
    taskid,
    waktu: event.event_time.getTime(),
  };
}

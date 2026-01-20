/**
 * @file src/domain/poli.aggregator.ts
 * @description Modul untuk mengambil data dari HFIS BPJS kemudian di simpan ke database lokal
 * menggunakan Prisma ORM.
 */

import prisma from "../lib/prisma";
import { getAllPoliInfo } from "../bpjs/bpjs.client";

/**
 * Sinkronisasi data poli dari BPJS ke database lokal
 * Dipanggil setiap minggu sekali atau manual
 */

export async function syncPoliData() {
  console.log("🔄 Sinkronisasi data poli dari BPJS...");

  const poliInfo = await getAllPoliInfo();
  for (const poli of poliInfo) {
    await prisma.poli.upsert({
      where: { poli_id: poli.kodepoli }, // gunakan unique poli_id
      update: {
        nama: poli.namapoli,
        kode_subspesialis: poli.kodesubspesialis,
        nama_subspesialis: poli.namasubspesialis,
      },
      create: {
        poli_id: poli.kodepoli,
        nama: poli.namapoli,
        kode_subspesialis: poli.kodesubspesialis,
        nama_subspesialis: poli.namasubspesialis,
      },
    });
  }

  console.log("✅ Selesai sinkronisasi data poli");
}

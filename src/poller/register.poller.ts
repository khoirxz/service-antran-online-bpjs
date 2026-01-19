/**
 * Poller berfungsi sebagai proses background yang secara berkala
 * mengambil data dari sistem eksternal (Khanza) dan menyimpannya
 * ke dalam database lokal menggunakan Prisma ORM.
 *
 * File ini khusus menangani polling untuk event pendaftaran pasien (REGISTER).
 */
import { fetchRegisterEvents } from "../khanza/khanza.query";
import prisma from "../lib/prisma";
import { getPollingState, updatePollingState } from "../storage/polling.state";

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
    // format tgl_registrasi menjadi YYYY-MM-DD
    const tgl_registrasi = new Date(row.tgl_registrasi)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "-")
      .replace("T", " ")
      .slice(0, 10);
    const event_time = new Date(`${tgl_registrasi} ${row.jam_registrasi}`);
    console.log("Memproses event register untuk:", event_time);

    // skip jika terdapat anomali
    if (event_time <= state?.last_event_time!) continue;

    try {
      // Format jam dari HH:MM:SS menjadi HH:MM
      const jamMulaiFormatted = row.jam_mulai.slice(0, 5);
      const jamSelesaiFormatted = row.jam_selesai.slice(0, 5);

      // Parse jam dari row.jam_registrasi (format HH:MM:SS)
      const [hours, minutes, seconds] = row.jam_registrasi
        .split(":")
        .map(Number);
      const estimasiTime = new Date(tgl_registrasi);
      estimasiTime.setHours(hours, minutes + 6, seconds);
      const estimasiUnix = estimasiTime.getTime();

      await prisma.visitEvent.create({
        data: {
          visit_id: row.no_rawat,
          event_type: "REGISTER",
          event_time: event_time,
          is_jkn: true,
          // payload: {
          //   kodebooking: row.no_rawat,
          //   jenispasien: "NON JKN",
          //   nomorkartu: "",
          //   nik: "",
          //   nohp: "",
          //   kodepoli: row.kd_poli,
          //   namapoli: row.nama_poli,
          //   pasienbaru: row.pasien_baru,
          //   norm: row.no_rkm_medis,
          //   tanggalperiksa: tgl_registrasi,
          //   kodedokter: row.kd_dokter,
          //   namadokter: row.nama_dokter,
          //   jampraktek: `${jamMulaiFormatted}-${jamSelesaiFormatted}`,
          //   jeniskunjungan: row.jenis_kunjungan,
          //   nomorreferensi: "",
          //   nomorantrean: row.no_reg,
          //   angkaantrean: parseInt(row.no_reg, 10),
          //   estimasidilayani: estimasiUnix,
          //   sisakuotajkn: row.kuota_jkn - parseInt(row.no_reg, 10),
          //   kuotajkn: row.kuota_jkn,
          //   sisakuotanonjkn: row.kuota_jkn - parseInt(row.no_reg, 10),
          //   kuotanonjkn: row.kuota_jkn,
          //   keterangan: "",
          // },
        },
      });
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

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
    lastTime || "00:00:00"
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
    const event_time = new Date(`${tgl_registrasi} ${row.jam_reg}`);
    console.log("Memproses event register untuk:", event_time);

    // skip jika terdapat anomali
    if (event_time <= state?.last_event_time!) continue;

    try {
      await prisma.visitEvent.create({
        data: {
          visit_id: row.no_rawat,
          event_type: "REGISTER",
          event_time: event_time,
          is_jkn: true,
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

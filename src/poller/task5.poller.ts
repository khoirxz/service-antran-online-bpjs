import { fetchTaskId } from "../khanza/khanza.query";
import prisma from "../lib/prisma";
import { getPollingState, updatePollingState } from "../storage/polling.state";

export async function pollTaskId5Event() {
  const state = await getPollingState("CHECKIN");

  if (!state) return;

  const rows = await fetchTaskId(5, state.last_event_time.toISOString());

  let maxEventTime = state.last_event_time;

  for (const row of rows) {
    const event_time = new Date(row.event_time);
    const tanggal = new Date(event_time.toISOString().slice(0, 10));
    console.log(state.last_event_time);
    console.log("Memproses event finish untuk:", event_time);

    if (event_time <= state.last_event_time) continue;

    try {
      await prisma.visitEvent.create({
        data: {
          visit_id: row.no_rawat,
          event_type: "FINISH",
          event_time: event_time,
          tanggal,
          jam_registrasi: "00:00",
          poli_id: "",
          dokter_id: "",
          is_jkn: true,
        },
      });
    } catch (error: any) {
      if (error.code !== "P2002") {
        console.error("Gagal menyimpan event finish:", error);
      }

      if (event_time > maxEventTime) {
        maxEventTime = event_time;
      }
    }
  }
  // update watermark
  if (maxEventTime > state.last_event_time) {
    await updatePollingState("FINISH", maxEventTime);
  }
}

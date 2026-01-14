import { fetchTaskId } from "../khanza/khanza.query";
import prisma from "../lib/prisma";
import { getPollingState, updatePollingState } from "../storage/polling.state";

export async function pollTaskId2Event() {
  const state = await getPollingState("CHECKIN");

  if (!state) return;

  const rows = await fetchTaskId(2, state.last_event_time.toISOString());

  let maxEventTime = state.last_event_time;

  for (const row of rows) {
    const event_time = state.last_event_time;
    console.log(state.last_event_time);
    console.log("Memproses event checkin untuk:", event_time);

    if (event_time <= state.last_event_time) continue;

    try {
      await prisma.visitEvent.create({
        data: {
          visit_id: row.no_rawat,
          event_type: "CHECKIN",
          event_time: event_time,
          is_jkn: true,
        },
      });
    } catch (error: any) {
      if (error.code !== "P2002") {
        console.error("Gagal menyimpan event checkin:", error);
      }

      if (event_time > maxEventTime) {
        maxEventTime = event_time;
      }
    }
  }
  // update watermark
  if (maxEventTime > state.last_event_time) {
    await updatePollingState("CHECKIN", maxEventTime);
  }
}

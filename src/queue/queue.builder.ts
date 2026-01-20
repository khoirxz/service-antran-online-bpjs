import prisma from "../lib/prisma";
import {
  buildRegisterPayload,
  buildTaskUpdatePayload,
} from "../domain/queue.payload";

/**
 * Build queue dari VisitEvent yang READY_BPJS
 * Dipanggil setiap 1 menit
 */
export async function buildQueue() {
  const dbEvents = await prisma.visitEvent.findMany({
    where: {
      is_jkn: true,
      status: "READY_BPJS", // Hanya ambil yang sudah valid
    },
    orderBy: {
      event_time: "asc",
    },
    take: 100,
  });

  console.log(`📦 Found ${dbEvents.length} READY_BPJS events to queue`);

  for (const event of dbEvents) {
    // Untuk REGISTER event (task_id = 1)
    const task_id = 1; // event_type REGISTER selalu task_id 1

    // Cek apakah sudah ada di queue
    const exists = await prisma.bpjsAntreanQueue.findUnique({
      where: {
        visit_id_task_id: {
          visit_id: event.visit_id,
          task_id,
        },
      },
    });

    if (exists) {
      console.log(
        `⏭️  Event ${event.visit_id} sudah ada di queue (status: ${exists.status})`,
      );
      continue;
    }

    try {
      // Build payload untuk REGISTER
      const payload = await buildRegisterPayload(event);

      // Create queue item
      await prisma.bpjsAntreanQueue.create({
        data: {
          visit_id: event.visit_id,
          task_id,
          event_time: event.event_time,
          payload: JSON.parse(JSON.stringify(payload)),
        },
      });

      console.log(
        `✅ Queued ${event.visit_id} - poli: ${event.poli_id}, antrean: ${event.nomor_antrean}`,
      );
    } catch (error) {
      console.error(
        `❌ Error queueing ${event.visit_id}:`,
        (error as Error).message,
      );
    }
  }
}

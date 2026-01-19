import { prisma } from "../server";
import { toDomainEvent } from "../domain/visit-event.factory";
import { validateForBpjs } from "../domain/bpjs.validator";
import {
  buildRegisterPayload,
  buildTaskUpdatePayload,
} from "../domain/payload.builder";
import { mapEventToTaskId } from "../domain/task.mapper";

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

  for (const dbEvent of dbEvents) {
    console.log(dbEvent);
    const event = toDomainEvent(dbEvent);
    const task_id = mapEventToTaskId(event.event_type);

    const exists = await prisma.bpjsAntreanQueue.findUnique({
      where: {
        visit_id_task_id: {
          visit_id: event.visit_id,
          task_id,
        },
      },
    });

    if (exists) continue;

    try {
      validateForBpjs(event);

      const payload =
        task_id === 1
          ? buildRegisterPayload(event)
          : buildTaskUpdatePayload(event, task_id);

      await prisma.bpjsAntreanQueue.create({
        data: {
          visit_id: event.visit_id,
          task_id,
          event_time: event.event_time,
          payload,
        },
      });
    } catch (error) {
      console.warn(
        `Skipping event ${event.id} for BPJS queue: ${(error as Error).message}`,
      );
    }
  }
}

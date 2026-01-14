import { VisitEvent } from "../domain/event.model";
import { mapEventToTaskId } from "../domain/task.mapper";

async function enqueueIfNeeded(event: VisitEvent) {
  const taskId = mapEventToTaskId(event.eventType);

  if (await queueExists(event, visitId, taskId)) return;

  const payload = buildBpjsPayload(event, taskId);

  await saveQueueEntry({
    visitId: event.visitId,
    taskId,
    payload,
    eventTime: event.eventTime,
    status: "PENDING",
  });
}

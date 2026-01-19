import { EventType } from "./visit-event.model";

export function mapEventToTaskId(eventType: EventType): number {
  switch (eventType) {
    case "REGISTER":
      return 1;
    case "CHECKIN":
      return 2;
    case "START":
      return 3;
    case "FINISH":
      return 4;
    default:
      throw new Error(`Unknown event type: ${eventType}`);
  }
}

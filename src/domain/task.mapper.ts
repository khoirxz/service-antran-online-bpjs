// Task ID mapping for BPJS API
// REGISTER (1), CHECKIN (3), START (4), FINISH (5)
export type EventType = "REGISTER" | "CHECKIN" | "START" | "FINISH";

export function mapEventToTaskId(eventType: EventType): number {
  switch (eventType) {
    case "REGISTER":
      return 1;
    case "CHECKIN":
      return 3;
    case "START":
      return 4;
    case "FINISH":
      return 5;
    default:
      throw new Error(`Unknown event type: ${eventType}`);
  }
}

import { VisitEvent } from "./visit-event.model";

export function validateForBpjs(event: VisitEvent) {
  // if (!event.is_jkn) throw new Error("NON_JKN_SKIP");
  if (!event.event_type) throw new Error("NO_EVENT_TIME");

  // khusus REGISTER (taskId 1)
  if (event.event_type === "REGISTER") {
    // if (!event.patient.bpjs_number) throw new Error("NO_BPJS_NUMBER");
    // if (!event.poli.bpjs_code) throw new Error("NO_POLI_BPJS");
    // if (!event.doctor.bpjs_code) throw new Error("NO_DOKTER_BPJS");
    // if (!event.queue) throw new Error("NO_QUEUE_INFO");
  }
}

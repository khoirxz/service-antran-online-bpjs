export type EventType = "REGISTER" | "CHECKIN" | "START" | "FINISH";

export interface VisitEvent {
  visit_id: string; // no rawat
  event_type: EventType;
  event_time: Date; // timestamp dari task_id_x
  is_jkn: boolean;

  patient: {
    rm: string;
    nik: string;
    bpjs_number?: string;
    phone?: string;
    is_new: boolean;
  };

  poli: {
    bpjs_code: string;
    name: string;
  };

  doctor: {
    bpjs_code: string;
    name: string;
    practice_time: string; // e.g., "08:00-12:00"
  };

  queue?: {
    number_text: string;
    number_int: number;
    estimated_ms: number;
    quota_jkn: number;
    quota_remaining: number;
  };

  visitJkn?: {
    type: number; // 1-4
    reference_number?: string;
  };
}

export type EventType =
  | "REGISTER"
  | "CHECKIN"
  | "START_SERVICE"
  | "FINISH_SERVICE";

export interface VisitEvent {
  visitId: string; // no rawat
  eventType: EventType;
  eventTime: Date; // timestamp dari task_id_x
  isJkn: boolean;

  patient: {
    rm: string;
    nik: string;
    bpjsNumber?: string;
    phone?: string;
    isNew: boolean;
  };

  poli: {
    bpjsCode: string;
    name: string;
  };

  doctor: {
    bpjsCode: string;
    name: string;
    practiceTime: string; // e.g., "08:00-12:00"
  };

  queue?: {
    numberText: string;
    numberInt: number;
    estimatedMs: number;
    quotaJkn: number;
    quotaRemaining: number;
  };

  visitJkn?: {
    type: number; // 1-4
    referenceNumber?: string;
  };
}

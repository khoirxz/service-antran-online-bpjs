import { VisitEvent } from "./visit-event.model";

export function buildRegisterPayload(event: VisitEvent) {
  return {
    kodebooking: event.visit_id,
    jenispasien: event.patient!.bpjs_number ? "JKN" : "NONJKN",
    nomorkartu: event.patient!.bpjs_number,
    nik: event.patient!.nik,
    nohp: event.patient!.phone ?? "",
    kodepoli: event.poli!.bpjs_code,
    namapoli: event.poli!.name,
    pasienbaru: event.patient!.is_new ? 1 : 0,
    norm: event.patient!.rm,
    tanggalperiksa: event.event_time.toISOString().slice(0, 10),
    kodedokter: event.doctor!.bpjs_code,
    namadokter: event.doctor!.name,
    jampraktek: event.doctor!.practice_time,
    jeniskunjungan: event.visitJkn?.type ?? 3,
    nomorreferensi: event.visitJkn?.reference_number ?? "",
    nomorantrean: event.queue!.number_text,
    angkaantrean: event.queue!.number_int,
    estimasidilayani: event.queue!.estimated_ms,
    sisakuotajkn: event.queue!.quota_remaining,
    kuotajkn: event.queue!.quota_jkn,
    sisakuotanonjkn: 0,
    kuotanonjkn: 0,
    keterangan: "Harap hadir 30 menit lebih awal",
  };
}

export function buildTaskUpdatePayload(event: VisitEvent, task_id: number) {
  return {
    kodebooking: event.visit_id,
    task_id,
    waktu: event.event_time.getTime(),
  };
}

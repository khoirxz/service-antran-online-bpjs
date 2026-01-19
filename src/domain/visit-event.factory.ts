export function toDomainEvent(dbEvent: any) {
  return {
    visit_id: dbEvent.visit_id,
    event_type: dbEvent.event_type,
    event_time: dbEvent.event_time,
    visitJkn: dbEvent.visitJkn,
    ...(dbEvent.payload ?? {}),
  };
}

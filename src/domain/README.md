# Domain Layer (`src/domain/`)

This directory contains **business logic** and **domain models** for the BPJS queue integration system.

## Files Overview

### 🎫 Queue & Payload

**`queue.payload.ts`** - Build BPJS API payloads

- `buildRegisterPayload(event, snapshot)` - Convert VisitEvent + HFIS snapshot → REGISTER payload
- `buildTaskUpdatePayload(event, taskId)` - Convert VisitEvent → CHECKIN/START/FINISH payload
- **Data Source:** Khanza (patient ID) + HFIS (trusted data)
- **Usage:** Queue Builder → Queue → Queue Worker

### ✅ Validation

**`hfis.validator.ts`** - Validate registration data against BPJS HFIS

- `validateHfisData(poliId, doctorId, date)` - Check doctor/poli exists in HFIS snapshot
- `validateRegistration(poliId, doctorId, date, ...)` - Full registration validation
- **Purpose:** Prevent sending invalid data to BPJS
- **Usage:** REGISTER Poller → Set VisitEvent status (READY_BPJS or BLOCKED_BPJS)

**`bpjs.validator.ts`** - Validate event for BPJS submission (legacy, minimal use)

- `validateForBpjs(event)` - Basic event validation
- **Note:** Mostly replaced by `hfis.validator.ts`

### 📊 Quota & Aggregation

**`quota.aggregator.ts`** - Calculate available quota and wait times

- `refreshDoctorScheduleFromBpjs(date)` - Sync HFIS quota data to DoctorScheduleQuota table
- `calculateQuota(poliId, doctorId, date)` - Get remaining JKN/non-JKN quota
- `calculateEstimatedTime(date, startTime, queueNumber)` - Estimate service time
- **Data Source:** HFIS snapshot (DoctorScheduleQuota table)
- **Usage:** REGISTER Poller → Build payload

**`poli.aggregator.ts`** - Sync clinic/poli data

- `syncPoliData()` - Fetch poli data from BPJS HFIS → Poli table
- **Frequency:** Weekly (Monday 06:00)
- **Purpose:** Keep clinic info up-to-date

### 🎯 Task Management

**`task.mapper.ts`** - Map event types to BPJS task IDs

- `mapEventToTaskId(eventType)` - REGISTER→1, CHECKIN→3, START→4, FINISH→5
- **Usage:** Queue Builder

**`task.progress.ts`** - Manage task_progress JSON field

- `getTaskProgress(json)` - Parse task_progress from VisitEvent
- `updateTaskProgress(current, taskId, status, reason?)` - Update single task
- `isTaskSent(current, taskId)` - Check if task was sent successfully
- `getTaskStatus(current, taskId)` - Get task status (DRAFT/SENT_BPJS/FAILED_BPJS)
- **Purpose:** Track REGISTER + CHECKIN/START/FINISH progress in single VisitEvent
- **Usage:** Task Pollers, Queue Builder, Queue Worker

---

## Data Flow

```
REGISTER Poller
  ↓ (fetchRegisterEvents from Khanza)
  ├─ validateRegistration() via HFIS
  ├─ calculateQuota() from HFIS
  └─ CREATE VisitEvent (status: READY_BPJS or BLOCKED_BPJS)

Task Pollers (3/4/5)
  ↓ (fetchTaskId from Khanza)
  └─ UPDATE VisitEvent.task_progress (add CHECKIN/START/FINISH)

Queue Builder
  ↓ (build BpjsAntreanQueue)
  ├─ Find READY_BPJS events → buildRegisterPayload() → queue task_id=1
  └─ Check task_progress → buildTaskUpdatePayload() → queue task_id 3/4/5

Queue Worker
  ↓ (send to BPJS API)
  └─ UPDATE VisitEvent.task_progress (set status: SENT_BPJS or FAILED_BPJS)
```

---

## Key Principles

✅ **HFIS is Source of Truth**

- Never trust Khanza for doctor/poli names, schedules, or quotas
- Use HFIS snapshot (DoctorScheduleQuota) for all BPJS-bound data

✅ **Single VisitEvent per Visit**

- One record per `visit_id` (no_rawat)
- All task statuses in `task_progress` JSON field
- No duplicate events

✅ **Fail Fast on Validation**

- Reject invalid registrations early (BLOCKED_BPJS)
- Don't queue task updates without REGISTER sent
- Throw errors with clear messages

✅ **Immutable Payloads**

- Payload built once → stored in queue → sent to BPJS
- Don't modify payload after queueing

---

## Testing Checklist

- [ ] `hfis.validator.ts` blocks invalid doctor/poli codes
- [ ] `quota.aggregator.ts` returns correct remaining quota
- [ ] `buildRegisterPayload()` uses HFIS snapshot for doctor/poli data
- [ ] `task.progress.ts` correctly updates/tracks task statuses
- [ ] Queue Builder only enqueues task 3/4/5 if REGISTER sent
- [ ] Queue Worker updates task_progress on success/failure

---

## Common Issues

**Issue:** Doctor name is wrong in BPJS submission
**Root Cause:** Using Khanza name instead of HFIS
**Solution:** Always pull from `snapshot.nama_dokter`

**Issue:** Task 3/4/5 events not showing in queue
**Root Cause:** Task pollers can't find REGISTER event, or REGISTER not SENT_BPJS
**Solution:** Verify REGISTER created first, then verify status is SENT_BPJS

**Issue:** Validation errors for valid doctor/poli
**Root Cause:** Doctor/poli not in HFIS snapshot or date not matching
**Solution:** Run `refreshDoctorScheduleFromBpjs()` to sync latest HFIS data

---

## Dependencies

- `@prisma/client` - Database access
- `axios` - BPJS API requests
- `bpjs.client.ts` - BPJS API wrapper
- `khanza.query.ts` - Khanza queries (patient ID only)

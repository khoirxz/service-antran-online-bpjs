# Implementation Guide - Refactored VisitEvent Structure

## Overview

Successfully refactored from **duplicate VisitEvents** (one per task) to **single VisitEvent** with `task_progress` JSON field.

## Changes Applied

### 1. Database Schema (`prisma/schema.prisma`)

**Removed:**

- `event_type` ENUM column (REGISTER | CHECKIN | START | FINISH)
- UNIQUE constraint on (visit_id, event_type)

**Added:**

- `task_progress` JSON field to track all task statuses
- Made `visit_id` UNIQUE (single entry per visit)

**Migration:** `20260120063651_refactor_single_visit_event_with_task_progress`

### 2. New Helper Module (`src/domain/task.progress.ts`)

Purpose: Manage task_progress JSON operations

```typescript
// Parse JSON to object
getTaskProgress(progressJson) → TaskProgressMap

// Update specific task status
updateTaskProgress(current, taskId, status, failedReason?) → TaskProgressMap

// Check if task was sent
isTaskSent(current, taskId) → boolean

// Get specific task status
getTaskStatus(current, taskId) → "DRAFT" | "SENT_BPJS" | "FAILED_BPJS"
```

### 3. Task Pollers (task3/task4/task5)

**Change:** CREATE → UPDATE

Before: Created new VisitEvent with event_type="CHECKIN/START/FINISH"
After: Updates existing REGISTER event's task_progress field

```typescript
// CHECKIN Poller (task3.poller.ts)
1. Find or create VisitEvent from REGISTER poller
2. Check Khanza task_id_3 column for new events
3. Update VisitEvent.task_progress["3"] = { status: "DRAFT" }

// START Poller (task4.poller.ts)
1. Find existing VisitEvent (REGISTER already created)
2. Check Khanza task_id_4 column for new events
3. Update VisitEvent.task_progress["4"] = { status: "DRAFT" }

// FINISH Poller (task5.poller.ts)
1. Find existing VisitEvent (REGISTER already created)
2. Check Khanza task_id_5 column for new events
3. Update VisitEvent.task_progress["5"] = { status: "DRAFT" }
```

### 4. Queue Builder (`src/queue/queue.builder.ts`)

**Change:** Query logic

Before: Separate query for VisitEvent where event_type IN (CHECKIN, START, FINISH)
After: Check task_progress field for task 3/4/5

```typescript
// NEW logic
for (const event of allVisitEvents) {
  const progress = getTaskProgress(event.task_progress);

  // Check each task (3, 4, 5)
  for (const taskId of [3, 4, 5]) {
    if (progress[taskId.toString()]) {
      // Task exists (status: DRAFT)
      // Only queue if REGISTER already SENT_BPJS
      // Create BpjsAntreanQueue with task_id
    }
  }
}
```

### 5. Queue Worker (`src/queue/queue.worker.ts`)

**Change:** Update task_progress instead of status

Before: `await UPDATE VisitEvent SET status="SENT_BPJS" WHERE visit_id_event_type`
After: `await UPDATE VisitEvent SET task_progress=... WHERE visit_id`

```typescript
// On success
const newProgress = updateTaskProgress(
  visitEvent.task_progress,
  job.task_id,
  "SENT_BPJS"
);
await UPDATE VisitEvent { task_progress: newProgress };

// On failure after max retries
const newProgress = updateTaskProgress(
  visitEvent.task_progress,
  job.task_id,
  "FAILED_BPJS",
  errorMsg
);
await UPDATE VisitEvent { task_progress: newProgress };
```

## Data Structure Examples

### REGISTER Event (Just Created)

```json
{
  "visit_id": "2026/01/20/001234",
  "event_time": "2026-01-20T08:00:00Z",
  "status": "READY_BPJS",
  "poli_id": "101",
  "dokter_id": "D001",
  "task_progress": {}
}
```

### After CHECKIN Detected

```json
{
  "visit_id": "2026/01/20/001234",
  "task_progress": {
    "3": {
      "status": "DRAFT"
    }
  }
}
```

### After Queue Processes REGISTER + CHECKIN

```json
{
  "visit_id": "2026/01/20/001234",
  "status": "SENT_BPJS",
  "task_progress": {
    "1": {
      "status": "SENT_BPJS",
      "sentAt": "2026-01-20T10:00:00Z"
    },
    "3": {
      "status": "SENT_BPJS",
      "sentAt": "2026-01-20T10:05:00Z"
    },
    "4": {
      "status": "DRAFT"
    },
    "5": {
      "status": "DRAFT"
    }
  }
}
```

### After START Fails

```json
{
  "task_progress": {
    "4": {
      "status": "FAILED_BPJS",
      "failedReason": "Connection timeout after 5 retries"
    }
  }
}
```

## Benefits Summary

| Aspect                 | Before                         | After                         |
| ---------------------- | ------------------------------ | ----------------------------- |
| **Duplicate Events**   | ❌ 4 events per visit          | ✅ 1 event per visit          |
| **Query Complexity**   | Complex (event_type filtering) | Simple (visit_id lookup)      |
| **Update Logic**       | Multiple UPDATE statements     | Single UPDATE with JSON merge |
| **Lifecycle Tracking** | Scattered across 4 rows        | Single unified record         |
| **Scalability**        | Hard to add new tasks          | Easy (add to task_progress)   |
| **Data Consistency**   | Risk of orphaned rows          | Atomic per visit              |
| **Audit Trail**        | Multiple rows to join          | One record with full history  |

## Testing Strategy

### Unit Tests

```typescript
// Test task progress helper
updateTaskProgress({}, 1, "SENT_BPJS");
updateTaskProgress({ "1": { status: "SENT_BPJS" } }, 3, "DRAFT");
```

### Integration Tests

1. **Task Pollers**
   - Poll REGISTER event → Create VisitEvent with empty task_progress ✓
   - Poll CHECKIN event → Update task_progress["3"] = DRAFT ✓
   - Poll START event → Update task_progress["4"] = DRAFT ✓
   - Poll FINISH event → Update task_progress["5"] = DRAFT ✓

2. **Queue Builder**
   - Find REGISTER events with status=READY_BPJS → Create queue ✓
   - Find task 3/4/5 in task_progress → Create queue only if REGISTER SENT ✓

3. **Queue Worker**
   - REGISTER task_id=1 success → Set task_progress["1"].status=SENT_BPJS ✓
   - CHECKIN task_id=3 success → Set task_progress["3"].status=SENT_BPJS ✓
   - Task failure → Set task_progress[taskId].status=FAILED_BPJS ✓

4. **End-to-End**
   - REGISTER → queue → SENT ✓
   - CHECKIN detected → queue → SENT ✓
   - START detected → queue → SENT ✓
   - FINISH detected → queue → SENT ✓
   - All in single VisitEvent.task_progress ✓

## Deployment Checklist

- [x] Schema updated and migrated
- [x] TypeScript compilation passes
- [x] All pollers refactored (task3/4/5)
- [x] Queue builder refactored
- [x] Queue worker refactored
- [x] Helper module created (task.progress.ts)
- [x] Build passes without errors
- [ ] Run integration tests
- [ ] Deploy to dev environment
- [ ] Verify pollers create/update events correctly
- [ ] Verify queue builder enqueues tasks
- [ ] Verify queue worker updates task_progress
- [ ] Monitor logs for any errors
- [ ] Deploy to staging
- [ ] Final production deployment

## Rollback Plan

If issues arise, rollback by:

1. Revert Prisma schema to include `event_type` column
2. Create rollback migration
3. Apply migration: `ALTER TABLE VisitEvent ADD COLUMN event_type ...`
4. Restore backup or recreate events from archive
5. Revert code changes in all modified files

Expected downtime: ~5-10 minutes during migration

## Support & Monitoring

### Key Metrics to Monitor

```
- Pollers creating/updating VisitEvents successfully
- Queue builder finding tasks in task_progress
- Queue worker updating task_progress without errors
- No NULL task_progress entries (should be {} initially)
- No missing task statuses in completed visits
```

### Common Issues

**Issue:** task_progress field NULL
**Solution:** Initialize as {} during CREATE

**Issue:** Can't find visit_id (P2025)
**Solution:** REGISTER poller must run before task pollers

**Issue:** Queue not building tasks
**Solution:** Check task_progress has entries, REGISTER must be SENT_BPJS

### Log Patterns to Watch

```
✅ Updated CHECKIN progress untuk 2026/01/20/001234
⏭️ REGISTER event tidak ditemukan untuk 2026/01/20/001235, skip CHECKIN
✅ Queued update 2026/01/20/001234 (task_id 3)
✅ Success: 2026/01/20/001234 sent to BPJS (code: 200)
```

## Questions & Support

For questions about the refactored design, refer to:

- REFACTOR_SUMMARY.md - Technical overview
- DATA_FLOW.md - Visual flow diagrams
- src/domain/task.progress.ts - Helper function documentation

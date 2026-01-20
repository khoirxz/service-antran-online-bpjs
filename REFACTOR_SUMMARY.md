# Refactoring Summary: Single VisitEvent with task_progress

## Problem

The original design created duplicate VisitEvents for each task (REGISTER, CHECKIN, START, FINISH), resulting in data duplication and unnecessary complexity.

## Solution

Implemented a single `VisitEvent` per visit with a `task_progress` JSON field tracking all task statuses.

## Database Schema Changes

### Before

```sql
VisitEvent {
  visit_id (String) UNIQUE
  event_type (Enum: REGISTER | CHECKIN | START | FINISH) [UNIQUE with visit_id]
  event_time (DateTime)
  status (VisitEventStatus)
  ...
  UNIQUE (visit_id, event_type)
}
```

### After

```sql
VisitEvent {
  visit_id (String) UNIQUE
  event_time (DateTime)
  status (VisitEventStatus) -- Only for REGISTER validation
  task_progress (JSON) -- Track all task statuses
  ...
}
```

## task_progress Structure

```typescript
task_progress = {
  "1": {
    status: "SENT_BPJS" | "DRAFT" | "FAILED_BPJS",
    sentAt: "2026-01-20T10:00:00Z",
    failedReason?: "Error message"
  },
  "3": { status: "SENT_BPJS", sentAt: "2026-01-20T10:05:00Z" },
  "4": { status: "DRAFT" },
  "5": { status: "FAILED_BPJS", failedReason: "..." }
}
```

## Code Changes

### 1. Helper Functions (src/domain/task.progress.ts) - NEW

- `getTaskProgress(json)` - Parse JSON to TaskProgressMap
- `updateTaskProgress(current, taskId, status, reason?)` - Update specific task
- `isTaskSent(current, taskId)` - Check if task was sent
- `getTaskStatus(current, taskId)` - Get task status

### 2. Task Pollers (task3/4/5)

**Before**: Created new VisitEvent with event_type CHECKIN/START/FINISH
**After**: Update existing REGISTER event's task_progress

```typescript
// Instead of CREATE
await prisma.visitEvent.create({
  visit_id, event_type: "CHECKIN", ...
})

// Now UPDATE
const existingEvent = await prisma.visitEvent.findUnique({ visit_id });
const newProgress = updateTaskProgress(existingEvent.task_progress, 3, "DRAFT");
await prisma.visitEvent.update({
  where: { visit_id },
  data: { task_progress: newProgress }
});
```

### 3. Queue Builder (queue.builder.ts)

**Before**: Queried separate events for task 3/4/5
**After**: Check task_progress field

```typescript
// Instead of
const updateEvents = await prisma.visitEvent.findMany({
  where: { event_type: { in: ["CHECKIN", "START", "FINISH"] } },
});

// Now iterate all events and check task_progress
for (const event of allEvents) {
  const progress = getTaskProgress(event.task_progress);
  for (const taskId of [3, 4, 5]) {
    if (progress[taskId.toString()]) {
      // Task exists, queue it
    }
  }
}
```

### 4. Queue Worker (queue.worker.ts)

**Before**: Updated separate event_type rows
**After**: Update task_progress JSON

```typescript
// Instead of updating by event_type
await prisma.visitEvent.update({
  where: { visit_id_event_type: { visit_id, event_type: "CHECKIN" } },
  data: { status: "SENT_BPJS" },
});

// Now update task_progress
const newProgress = updateTaskProgress(event.task_progress, 3, "SENT_BPJS");
await prisma.visitEvent.update({
  where: { visit_id },
  data: { task_progress: newProgress },
});
```

## Benefits

✅ **No Duplicate Data**

- Single VisitEvent per visit
- All task statuses in one record

✅ **Cleaner Queries**

- No need for UNIQUE(visit_id, event_type) constraint
- Simple visit_id lookup

✅ **Better Lifecycle Tracking**

- Full visit progress in one place
- Easy to audit complete flow: REGISTER → CHECKIN → START → FINISH

✅ **Scalable**

- Can easily add new tasks (task_id 6, 7, etc.) without schema changes
- JSON allows flexible task status structure

✅ **Data Consistency**

- Atomic updates per visit
- No orphaned events

## Migration Applied

Migration: `20260120063651_refactor_single_visit_event_with_task_progress`

Changes:

- Dropped `event_type` column
- Dropped UNIQUE constraint on (visit_id, event_type)
- Made `visit_id` UNIQUE
- Added `task_progress` JSON column
- Kept all other fields intact

## Files Modified

1. **prisma/schema.prisma** - Schema update
2. **src/domain/task.progress.ts** - NEW helper functions
3. **src/poller/register.poller.ts** - Removed event_type from CREATE
4. **src/poller/task3.poller.ts** - UPDATE instead of CREATE
5. **src/poller/task4.poller.ts** - UPDATE instead of CREATE
6. **src/poller/task5.poller.ts** - UPDATE instead of CREATE
7. **src/queue/queue.builder.ts** - Check task_progress instead of event_type
8. **src/queue/queue.worker.ts** - Update task_progress instead of status
9. **src/api/audit.routes.ts** - Remove event_type from SELECT

## Testing Checklist

- [x] TypeScript compilation passes
- [x] Database migration applied successfully
- [x] Task pollers update existing events
- [x] Queue builder checks task_progress
- [x] Queue worker updates task_progress
- [ ] REGISTER event created with empty task_progress
- [ ] Task pollers add DRAFT entries to task_progress
- [ ] Queue builder enqueues tasks based on task_progress
- [ ] Queue worker marks tasks SENT_BPJS in task_progress
- [ ] Failed tasks marked FAILED_BPJS with reason
- [ ] End-to-end flow works: REGISTER → CHECKIN → START → FINISH

## Rollback Plan (if needed)

If revert is required:

1. Add `event_type` column back to VisitEvent
2. Migrate task_progress data back to separate events
3. Revert code changes in pollers/builders/worker

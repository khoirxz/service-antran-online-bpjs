# Quick Reference - Refactored Code

## Files Changed

| File                            | Type    | Change                                        |
| ------------------------------- | ------- | --------------------------------------------- |
| `prisma/schema.prisma`          | Schema  | Added task_progress JSON, removed event_type  |
| `src/domain/task.progress.ts`   | NEW     | Helper functions for task_progress management |
| `src/poller/register.poller.ts` | Poller  | Removed event_type from CREATE                |
| `src/poller/task3.poller.ts`    | Poller  | CREATE → UPDATE task_progress                 |
| `src/poller/task4.poller.ts`    | Poller  | CREATE → UPDATE task_progress                 |
| `src/poller/task5.poller.ts`    | Poller  | CREATE → UPDATE task_progress                 |
| `src/queue/queue.builder.ts`    | Builder | Query task_progress instead of event_type     |
| `src/queue/queue.worker.ts`     | Worker  | Update task_progress instead of status        |
| `src/api/audit.routes.ts`       | API     | Removed event_type from SELECT                |

## Key Functions

### task.progress.ts

```typescript
// Get or parse task_progress JSON
getTaskProgress(progressJson: any): TaskProgressMap

// Update single task status
updateTaskProgress(
  current: any,
  taskId: number,
  status: "DRAFT" | "SENT_BPJS" | "FAILED_BPJS",
  failedReason?: string
): TaskProgressMap

// Check task status
isTaskSent(current: any, taskId: number): boolean
getTaskStatus(current: any, taskId: number): "DRAFT" | "SENT_BPJS" | "FAILED_BPJS" | undefined
```

## Poller Changes

### task3.poller.ts (CHECKIN)

```typescript
// OLD: CREATE new VisitEvent
await prisma.visitEvent.create({ event_type: "CHECKIN", ... })

// NEW: UPDATE existing event
const existingEvent = await prisma.visitEvent.findUnique({ visit_id });
const newProgress = updateTaskProgress(existingEvent.task_progress, 3, "DRAFT");
await prisma.visitEvent.update({ where: { visit_id }, data: { task_progress: newProgress } });
```

## Queue Builder Changes

```typescript
// OLD: Find separate event_type rows
const updateEvents = await prisma.visitEvent.findMany({
  where: { event_type: { in: ["CHECKIN", "START", "FINISH"] } },
});

// NEW: Check task_progress in all events
for (const event of allVisitEvents) {
  const progress = getTaskProgress(event.task_progress);
  for (const taskId of [3, 4, 5]) {
    if (progress[taskId.toString()]) {
      // Task found, queue it
    }
  }
}
```

## Queue Worker Changes

```typescript
// OLD: Update by event_type
await prisma.visitEvent.update({
  where: { visit_id_event_type: { visit_id, event_type: "CHECKIN" } },
  data: { status: "SENT_BPJS" },
});

// NEW: Update task_progress JSON
const newProgress = updateTaskProgress(
  visitEvent.task_progress,
  3,
  "SENT_BPJS",
);
await prisma.visitEvent.update({
  where: { visit_id },
  data: { task_progress: newProgress as any },
});
```

## Database Changes

### VisitEvent Table

**Columns Added:**

- `task_progress: Json` - Track all task (1/3/4/5) statuses

**Columns Dropped:**

- `event_type` - No longer needed, now in task_progress

**Constraints Changed:**

- OLD: `UNIQUE (visit_id, event_type)` - Allowed multiple rows per visit
- NEW: `UNIQUE (visit_id)` - Single row per visit

### Task Progress Structure

```json
{
  "1": {
    "status": "SENT_BPJS" | "DRAFT" | "FAILED_BPJS",
    "sentAt": "2026-01-20T10:00:00Z",  // Only if SENT_BPJS
    "failedReason": "error message"    // Only if FAILED_BPJS
  },
  "3": { ... },
  "4": { ... },
  "5": { ... }
}
```

## Testing Queries

### Check VisitEvent structure

```sql
SELECT visit_id, status, task_progress
FROM VisitEvent
WHERE visit_id = '2026/01/20/001234'\G
```

### Check task_progress content

```typescript
const event = await prisma.visitEvent.findUnique({
  where: { visit_id: "2026/01/20/001234" },
});
console.log(event.task_progress); // Should show {"1": {...}, "3": {...}, ...}
```

### Check queue status

```typescript
const queue = await prisma.bpjsAntreanQueue.findMany({
  where: { visit_id: "2026/01/20/001234" },
  orderBy: { task_id: "asc" },
});
// Should show: task_id 1, 3, 4, 5
```

### Verify no duplicates

```sql
SELECT visit_id, COUNT(*) as count
FROM VisitEvent
GROUP BY visit_id
HAVING COUNT(*) > 1;  -- Should be empty
```

## Logs to Look For

### Success Pattern

```
✅ Queued 2026/01/20/001234 - poli: 101, antrean: 5       [Queue Builder]
✅ Updated CHECKIN progress untuk 2026/01/20/001234        [Task3 Poller]
✅ Queued update 2026/01/20/001234 (task_id 3)             [Queue Builder]
✅ Success: 2026/01/20/001234 sent to BPJS (code: 200)     [Queue Worker]
```

### Warning Pattern

```
⏭️ REGISTER event tidak ditemukan untuk 2026/01/20/001235   [Task3 Poller - before REGISTER]
⏭️ Skip update 2026/01/20/001234 (task_id 3)               [Queue Builder - REGISTER not sent]
❌ Job 2026/01/20/001234 marked as FAILED                  [Queue Worker - max retries reached]
```

## Troubleshooting

### Task poller says "REGISTER not found"

**Cause:** task3/4/5 poller runs before REGISTER poller for that visit
**Solution:** This is normal, pollers are async. They'll retry next cycle.

### Queue builder finds no tasks

**Cause:** task_progress is NULL or REGISTER not SENT_BPJS
**Verify:**

```typescript
const event = await prisma.visitEvent.findUnique({ visit_id });
console.log(event.task_progress, event.status);
```

### Type errors on task_progress update

**Cause:** Missing `as any` cast for JSON field
**Fix:**

```typescript
data: {
  task_progress: newProgress as any;
}
```

## Performance Tips

1. **Batch operations:** Queue builder reads up to 500 events at once
2. **Incremental polling:** Each poller tracks last_event_time watermark
3. **Index on event_time:** Speed up range queries in pollers
4. **Index on tanggal:** Speed up daily audit queries

## Migration Details

```
Migration: 20260120063651_refactor_single_visit_event_with_task_progress

Operations:
1. DROP UNIQUE INDEX `VisitEvent_visit_id_event_type_key`
2. ALTER TABLE DROP COLUMN event_type
3. ALTER TABLE ADD COLUMN task_progress JSON
4. ALTER TABLE ADD UNIQUE INDEX `VisitEvent_visit_id_key`

Rollback command (if needed):
npx prisma migrate resolve --rolled-back 20260120063651_refactor_single_visit_event_with_task_progress
```

## Documentation Files

- **REFACTOR_SUMMARY.md** - Detailed technical overview
- **DATA_FLOW.md** - Visual diagrams and examples
- **IMPLEMENTATION_GUIDE.md** - Deployment and monitoring
- **Quick_Reference.md** - This file

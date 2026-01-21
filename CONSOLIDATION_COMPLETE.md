# Data Model Consolidation - Complete ✅

## Overview

Successfully consolidated the VisitEvent data model by merging redundant `status` and `blocked_reason` fields into the unified `task_progress` JSON field. This eliminates schema duplication and provides a single source of truth for all task state tracking.

## Changes Made

### 1. Database Schema (`prisma/schema.prisma`)

- **Removed**: `status` field enum `VisitEventStatus` with values (DRAFT, READY_BPJS, BLOCKED_BPJS, SENT_BPJS, FAILED_BPJS)
- **Removed**: `blocked_reason` field (String?)
- **Updated**: `task_progress` JSON field documentation to clarify it now stores all task state including validation results

**New Consolidated Structure:**

```json
{
  "1": {
    "status": "DRAFT" | "READY_BPJS" | "BLOCKED_BPJS" | "SENT_BPJS" | "FAILED_BPJS",
    "blocked_reason": "string (REGISTER validation failure reason)",
    "sentAt": "ISO string (timestamp sent to BPJS)",
    "failedReason": "string (submission/validation failure)"
  },
  "3": {
    "status": "DRAFT" | "SENT_BPJS" | "FAILED_BPJS",
    "sentAt": "ISO string",
    "failedReason": "string"
  },
  "4": { ... },
  "5": { ... }
}
```

### 2. Task Progress Helper (`src/domain/task.progress.ts`)

- **Extended**: `TaskProgress` interface to include all 5 states for REGISTER (task_id=1)
- **Added**: `blocked_reason` field to TaskProgress (optional, only for REGISTER validation failures)
- **Updated**: `updateTaskProgress()` function to conditionally include fields based on status:
  - `blocked_reason` → included when status = "BLOCKED_BPJS" AND taskId = 1
  - `sentAt` → included when status = "SENT_BPJS"
  - `failedReason` → included when status = "FAILED_BPJS"
- **Added**: `isRegisterReady()` - check if task_progress["1"].status === "READY_BPJS"
- **Added**: `isRegisterSent()` - check if task_progress["1"].status === "SENT_BPJS"
- **Updated**: `isTaskSent()` to work with expanded status enum
- **Updated**: `getTaskStatus()` return type to include all 5 states

### 3. REGISTER Poller (`src/poller/register.poller.ts`)

- **Changed**: CREATE VisitEvent now sets `task_progress` instead of separate `status` field
- **Implementation**:
  ```typescript
  task_progress: updateTaskProgress(
    {},
    1,
    validation.status,
    validation.blockedReason,
  );
  ```
- **Result**: REGISTER validation result is now stored in `task_progress["1"]`

### 4. Queue Builder (`src/queue/queue.builder.ts`)

- **Updated Imports**: Added `isRegisterSent` helper function
- **Refactored REGISTER Logic**:
  - Changed from `where: { status: "READY_BPJS" }` to fetching all events and filtering by `progress["1"]?.status === "READY_BPJS"`
- **Fixed Variable Naming**: Renamed duplicate `allEvents` to `registerEvents` and `updateEvents` for clarity
- **Updated Task 3/4/5 Logic**: Check for REGISTER sent status using `isRegisterSent(event.task_progress)` instead of `event.status === "SENT_BPJS"`

### 5. Queue Worker (`src/queue/queue.worker.ts`)

- **Simplified Success Path**:
  - Removed conditional logic for REGISTER vs UPDATE
  - Now all tasks (1/3/4/5) use `updateTaskProgress()` for success updates
  ```typescript
  const newProgress = updateTaskProgress(
    visitEvent.task_progress,
    job.task_id,
    "SENT_BPJS",
  );
  ```
- **Simplified Failure Path**:
  - All tasks use unified `updateTaskProgress()` with failure status and error message
  ```typescript
  const newProgress = updateTaskProgress(
    visitEvent.task_progress,
    job.task_id,
    "FAILED_BPJS",
    errorMsg,
  );
  ```

### 6. Admin API Routes (`src/api/audit.routes.ts`)

- **Updated Imports**: Added `updateTaskProgress` and `getTaskProgress` helpers
- **Refactored GET /admin/events/blocked**:
  - Fetch all events, filter by `progress["1"]?.status === "BLOCKED_BPJS"`
  - Return `blocked_reason` from `progress["1"]?.blocked_reason`
- **Refactored POST /admin/events/:id/revalidate**:
  - Check blocked status from `task_progress["1"]`
  - Update using `updateTaskProgress()` instead of direct field assignment
  - Return new status from `updatedProgress["1"]?.status`
- **Refactored POST /admin/events/revalidate-all**:
  - Filter blocked events using `progress["1"]?.status === "BLOCKED_BPJS"`
  - Update all using unified `updateTaskProgress()` call
- **Refactored GET /admin/events/stats**:
  - Fetch all events, iterate to count status values from `progress["1"]?.status`
  - Return counts for each status: DRAFT, READY_BPJS, BLOCKED_BPJS, SENT_BPJS, FAILED_BPJS

### 7. Database Migration (`prisma/migrations/20260120075515_consolidate_task_progress`)

- **Applied**: Migration to drop `status` column from VisitEvent table
- **Applied**: Migration to drop `blocked_reason` column from VisitEvent table
- **Result**: Database schema synchronized with Prisma schema

## Benefits

✅ **Single Source of Truth**: All task state tracked in one JSON field
✅ **Reduced Redundancy**: Eliminated separate `status` and `blocked_reason` columns
✅ **Cleaner Schema**: Simpler Prisma model with fewer fields
✅ **Consistent Updates**: All task updates use same `updateTaskProgress()` function
✅ **Type Safety**: TaskProgress interface enforces correct field usage
✅ **Flexible Extensibility**: Easy to add new task fields without schema changes
✅ **Backward Compatible**: Code still handles null/undefined `task_progress` gracefully

## Status Mapping

### REGISTER (task_id = 1) - All 5 States

- `DRAFT` - Initial state, not yet validated
- `READY_BPJS` - Validation passed, ready to submit to BPJS
- `BLOCKED_BPJS` - Validation failed, includes `blocked_reason` explaining why
- `SENT_BPJS` - Successfully submitted to BPJS, includes `sentAt` timestamp
- `FAILED_BPJS` - Submission failed after retries, includes `failedReason`

### CHECKIN/START/FINISH (task_id = 3/4/5) - 3 States

- `DRAFT` - Not yet sent
- `SENT_BPJS` - Successfully sent to BPJS, includes `sentAt`
- `FAILED_BPJS` - Failed to send, includes `failedReason`

## Verification

✅ TypeScript compilation successful (`npm run build`)
✅ Database migration applied successfully (12/12 migrations up to date)
✅ All files updated with new task_progress API
✅ No deprecated field references remain in code

## Files Modified

- `prisma/schema.prisma`
- `src/domain/task.progress.ts`
- `src/poller/register.poller.ts`
- `src/queue/queue.builder.ts`
- `src/queue/queue.worker.ts`
- `src/api/audit.routes.ts`

## Next Steps

1. Test the service with actual Khanza/BPJS data
2. Verify that REGISTER validation state is correctly persisted
3. Monitor queue processing to ensure all tasks update state properly
4. Validate audit endpoints return correct blocked event statistics

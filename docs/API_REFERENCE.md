# API Reference

Complete API documentation untuk ANTREAN ONLINE BPJS Service.

## Table of Contents

1. [Quota APIs](#quota-apis)
2. [Admin APIs](#admin-apis)
3. [Health Check](#health-check)
4. [Error Handling](#error-handling)

---

## Quota APIs

### Calculate Real-time Quota

Hitung kuota real-time untuk dokter/poli/tanggal tertentu dengan deduplication dan fallback.

**Signature:**

```typescript
async function calculateQuota(
  poliId: string,
  dokterId: string,
  tanggal: string,
): Promise<QuotaInfo | null>;
```

**Parameters:**

| Param      | Type   | Required | Description                |
| ---------- | ------ | -------- | -------------------------- |
| `poliId`   | string | ✅       | ID poli (e.g., "001")      |
| `dokterId` | string | ✅       | ID dokter (e.g., "DOK001") |
| `tanggal`  | string | ✅       | Tanggal format YYYY-MM-DD  |

**Response: `QuotaInfo`**

```typescript
interface QuotaInfo {
  poli_id: string; // ID poli
  poli_name: string; // Nama poli
  dokter_id: string; // ID dokter
  dokter_name: string; // Nama dokter
  tanggal: string; // Tanggal (YYYY-MM-DD)
  jam_praktek: string; // Jam praktek (HH:MM-HH:MM)
  kuota_jkn: number; // Kuota JKN total
  total_registrasi: number; // Total registrasi hari itu
  sisa_kuota_jkn: number; // Sisa kuota JKN
  kuota_nonjkn: number; // Kuota non-JKN
  sisa_kuota_nonjkn: number; // Sisa kuota non-JKN
}
```

**Return Value:**

- `QuotaInfo`: Data kuota valid
- `null`: Schedule tidak ditemukan (no fallback) atau error

**Behavior:**

| Scenario                            | Action                                 |
| ----------------------------------- | -------------------------------------- |
| Schedule exists                     | Return quota from DB                   |
| Schedule missing, refresh in-flight | Wait 3s, return fallback               |
| Schedule missing, circuit open      | Return fallback immediately            |
| Schedule missing, idle              | Trigger async refresh, return fallback |
| No fallback available               | Return null                            |

**Example:**

```typescript
import { calculateQuota } from "./domain/quota.aggregator";

// Get current quota
const quota = await calculateQuota("001", "DOK001", "2026-01-21");

if (quota) {
  console.log(`Sisa kuota: ${quota.sisa_kuota_jkn}`);
  // Output: Sisa kuota: 8
} else {
  console.log("Schedule tidak tersedia");
}
```

**Latency:**

- Normal (schedule exists): **< 50ms**
- Missing (dedup active): **100-3000ms** (wait for refresh)
- Circuit open (fallback): **< 20ms** (no BPJS call)

---

### Refresh Doctor Schedule from BPJS

Sync jadwal dokter dari BPJS API ke database lokal.

**Signature:**

```typescript
async function refreshDoctorScheduleFromBpjs(
  kodePoli: string,
  tanggal: string,
): Promise<void>;
```

**Parameters:**

| Param      | Type   | Required | Description               |
| ---------- | ------ | -------- | ------------------------- |
| `kodePoli` | string | ✅       | Kode poli BPJS            |
| `tanggal`  | string | ✅       | Tanggal format YYYY-MM-DD |

**Throws:**

- Error jika BPJS API gagal atau tidak ada data

**Side Effects:**

- Insert/update `DoctorScheduleQuota` di database
- Set/complete `RefreshLock` di cache
- Log ke console

**Example:**

```typescript
import { refreshDoctorScheduleFromBpjs } from "./domain/quota.aggregator";

// Manual refresh
try {
  await refreshDoctorScheduleFromBpjs("001", "2026-01-21");
  console.log("✅ Refresh berhasil");
} catch (error) {
  console.error("❌ Refresh gagal:", error);
}
```

**Flow:**

```
Call BPJS getJadwalDokter()
  ↓
Parse response (kapasitas, jam praktek, nama dokter)
  ↓
Upsert ke DoctorScheduleQuota table
  ↓
Update fetchedAt timestamp
  ↓
Complete RefreshLock di cache
```

---

### Trigger Async Refresh

Trigger background refresh tanpa blocking (fire-and-forget).

**Signature:**

```typescript
async function triggerRefreshAsync(
  kodePoli: string,
  tanggal: string,
): Promise<void>;
```

**Parameters:**

| Param      | Type   | Required | Description        |
| ---------- | ------ | -------- | ------------------ |
| `kodePoli` | string | ✅       | Kode poli          |
| `tanggal`  | string | ✅       | Tanggal YYYY-MM-DD |

**Behavior:**

- Check deduplication (if refresh in-flight, skip)
- Set `RefreshLock` as refreshing
- Fire async `refreshDoctorScheduleFromBpjs()` in background
- Return immediately (non-blocking)
- Errors logged but not thrown

**Example:**

```typescript
import { triggerRefreshAsync } from "./domain/quota.aggregator";

// Non-blocking refresh
await triggerRefreshAsync("001", "2026-01-21");
// Returns immediately
// Refresh continues in background

// Next call will find updated schedule
const quota = await calculateQuota("001", "DOK001", "2026-01-21");
```

---

### Get Last-Known Schedule (Fallback)

Ambil schedule terbaru yang pernah disync sebagai fallback.

**Signature:**

```typescript
async function getLastKnownSchedule(
  poliId: string,
  dokterId: string,
  tanggal: string,
): Promise<DoctorScheduleQuota | null>;
```

**Parameters:**

| Param      | Type   | Required | Description               |
| ---------- | ------ | -------- | ------------------------- |
| `poliId`   | string | ✅       | ID poli                   |
| `dokterId` | string | ✅       | ID dokter                 |
| `tanggal`  | string | ✅       | Target tanggal YYYY-MM-DD |

**Response:**

- `DoctorScheduleQuota`: Last-known schedule (tanggal dioverride ke request)
- `null`: No schedule found within ±7 hari window

**Search Window:** ±7 hari dari target tanggal

**Example:**

```typescript
import { getLastKnownSchedule } from "./domain/quota.aggregator";

// Get fallback schedule
const fallback = await getLastKnownSchedule("001", "DOK001", "2026-01-21");

if (fallback) {
  console.log(`Using schedule dari ${fallback.tanggal}`);
  // Output: Using schedule dari 2026-01-20
} else {
  console.log("No fallback schedule found");
}
```

---

## Schedule Cache APIs

Low-level cache management untuk deduplication dan circuit breaker.

### Get Refresh Lock

**Signature:**

```typescript
function getRefreshLock(
  poliId: string,
  tanggal: string,
): RefreshLock | undefined;
```

**Returns:**

```typescript
interface RefreshLock {
  poli_id: string;
  tanggal: string;
  refreshing: boolean;
  lastRefreshed: Date;
  lastError?: Error;
}
```

---

### Set Refresh Lock

**Signature:**

```typescript
function setRefreshLock(poliId: string, tanggal: string): void;
```

**Effect:** Mark poli+tanggal as refreshing (deduplication).

---

### Complete Refresh Lock

**Signature:**

```typescript
function completeRefreshLock(poliId: string, tanggal: string): void;
```

**Effect:** Mark refresh as completed.

---

### Set Refresh Error

**Signature:**

```typescript
function setRefreshError(poliId: string, tanggal: string, error: Error): void;
```

**Effect:** Mark with error (circuit breaker), stores error for 10 min window.

---

### Is Circuit Open?

**Signature:**

```typescript
function isCircuitOpen(poliId: string, tanggal: string): boolean;
```

**Returns:** `true` jika recent error dalam 10 menit window.

---

### Get Cache Stats

**Signature:**

```typescript
function getRefreshCacheStats(): {
  totalLocks: number;
  refreshing: number;
  failed: number;
};
```

**Example:**

```typescript
import { getRefreshCacheStats } from "./domain/schedule.cache";

const stats = getRefreshCacheStats();
console.log(`Cache: ${stats.totalLocks} total, ${stats.refreshing} refreshing`);
```

---

## Scheduler APIs

### Start Quota Scheduler

**Signature:**

```typescript
function startQuotaScheduler(): void;
```

**Behavior:**

- Start 3 cron jobs:
  - 05:00 AM: Full refresh (today + tomorrow)
  - 12:00 PM: Light refresh (today)
  - 17:00 PM: Light refresh (today)
- Run async in background
- Continue until process terminates

**Example:**

```typescript
import { startQuotaScheduler } from "./scheduler/quota.scheduler";

// Start on app initialization
startQuotaScheduler();
console.log("📅 Scheduler started");
```

---

### Manual Refresh Quota

**Signature:**

```typescript
async function manualRefreshQuota(
  poliList: string[],
  tanggalList: string[],
): Promise<void>;
```

**Parameters:**

- `poliList`: Array of poli IDs
- `tanggalList`: Array of dates (YYYY-MM-DD)

**Behavior:**

- Refresh all combinations of poli × tanggal
- Use batch refresh with rate limiting (5 polis, 500ms delay)
- Log progress to console

**Example:**

```typescript
import { manualRefreshQuota } from "./scheduler/quota.scheduler";

// Manual refresh for multiple polis and dates
await manualRefreshQuota(["001", "002", "003"], ["2026-01-21", "2026-01-22"]);
console.log("✅ Manual refresh completed");
```

---

## Admin APIs

### Queue Status

_See [admin.routes.ts](../src/api/admin.routes.ts) for endpoints_

---

### Health Check

_See [health.routes.ts](../src/api/health.routes.ts) for endpoints_

---

## Error Handling

### Common Errors

| Error                    | Cause                 | Resolution                               |
| ------------------------ | --------------------- | ---------------------------------------- |
| `BPJS API timeout`       | BPJS server slow/down | Circuit breaker active, use fallback     |
| `Schedule not found`     | First time sync       | Wait for async refresh or manual refresh |
| `Invalid tanggal format` | Wrong date format     | Use YYYY-MM-DD format                    |
| `DB connection error`    | Database down         | Check database connection                |

### Error Responses

**calculateQuota() error:**

```typescript
// Instead of throwing, returns null
const quota = await calculateQuota(...);
if (!quota) {
  // Handle: no schedule found and no fallback
  return res.status(404).json({ error: "Schedule not found" });
}
```

**refreshDoctorScheduleFromBpjs() error:**

```typescript
// Throws error (must catch)
try {
  await refreshDoctorScheduleFromBpjs(poli, tanggal);
} catch (error) {
  console.error("Refresh failed:", error);
  // Error is recorded in RefreshLock for circuit breaker
}
```

---

## Performance Characteristics

### Latency SLAs

| Operation                | Latency | Condition               |
| ------------------------ | ------- | ----------------------- |
| `calculateQuota()`       | < 50ms  | Schedule exists         |
| `calculateQuota()`       | < 100ms | Dedup wait (in-flight)  |
| `calculateQuota()`       | < 20ms  | Circuit open (fallback) |
| `calculateQuota()`       | ~30s    | BPJS sync (worst case)  |
| `triggerRefreshAsync()`  | < 5ms   | Return immediately      |
| `getLastKnownSchedule()` | < 30ms  | DB query                |

### Throughput

| Metric                                   | Value                      |
| ---------------------------------------- | -------------------------- |
| Concurrent registrations (dedup)         | 100+ → 1 API call          |
| API calls per refresh                    | 1 per poli (no duplicates) |
| Daily API calls (3 refreshes × 30 polis) | ~90 calls                  |
| Registrasi per second                    | Limited by queue worker    |

---

## Related Documentation

- [SCHEDULE_OPTIMIZATION.md](./SCHEDULE_OPTIMIZATION.md) - Architecture & design
- [DATA_FLOW.md](../DATA_FLOW.md) - Data flow diagrams
- [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md) - File structure

---

**Last Updated:** January 21, 2026
**Version:** 1.0

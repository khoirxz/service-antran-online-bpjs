# Status Validation System

## 📌 Masalah yang Dipecahkan

Sebelumnya, tidak ada validasi apakah kode dokter/poli dari registrasi Khanza sesuai dengan data HFIS BPJS. Akibatnya:

- Event dengan kode dokter/poli salah tetap masuk queue
- Pengiriman ke BPJS gagal karena data tidak valid
- Sulit tracking mana data yang bermasalah

## ✅ Solusi: Status Validation dengan Flag

Sistem **status-based validation** yang mem-flag event berdasarkan validitasnya terhadap HFIS.

### Status Lifecycle

```
DRAFT → READY_BPJS → SENT_BPJS
  ↓          ↓
BLOCKED_BPJS  FAILED_BPJS
```

| Status         | Deskripsi                                    | Action                         |
| -------------- | -------------------------------------------- | ------------------------------ |
| `DRAFT`        | Data belum lengkap (field wajib kosong)      | Skip queue, tunggu fix data    |
| `READY_BPJS`   | Valid & siap dikirim                         | Masuk queue untuk dikirim      |
| `BLOCKED_BPJS` | Invalid (kode dokter/poli tidak ada di HFIS) | Skip queue, perlu audit manual |
| `SENT_BPJS`    | Berhasil dikirim ke BPJS                     | Final state - success          |
| `FAILED_BPJS`  | Ditolak BPJS setelah dikirim                 | Perlu investigasi              |

## 🔄 Alur Kerja

### 1. Polling & Validation

**File:** [register.poller.ts](../src/poller/register.poller.ts)

```typescript
// 1. Validasi data registrasi
const validation = await validateRegistration(
  row.kd_poli,
  row.kd_dokter,
  tgl_registrasi,
  row.no_reg,
  row.no_rawat,
);

// 2. Set status berdasarkan hasil
await prisma.visitEvent.create({
  data: {
    // ... data lain
    status: validation.status, // DRAFT / READY_BPJS / BLOCKED_BPJS
    blocked_reason: validation.blockedReason,
  },
});
```

### 2. Queue Building

**File:** [queue.builder.ts](../src/queue/queue.builder.ts)

```typescript
// Hanya ambil event dengan status READY_BPJS
const dbEvents = await prisma.visitEvent.findMany({
  where: {
    is_jkn: true,
    status: "READY_BPJS", // Filter: hanya yang valid
  },
});
```

### 3. Audit & Revalidation

**File:** [audit.routes.ts](../src/api/audit.routes.ts)

API endpoints untuk manage blocked events:

```bash
# Lihat semua event yang BLOCKED
GET /admin/events/blocked?limit=50&offset=0

# Revalidasi 1 event
POST /admin/events/123/revalidate

# Revalidasi semua BLOCKED events (batch)
POST /admin/events/revalidate-all

# Statistik status
GET /admin/events/stats
```

## 🔍 Validation Rules

**File:** [hfis.validator.ts](../src/domain/hfis.validator.ts)

### Rule 1: Field Wajib

```typescript
if (!poliId || !dokterId || !tanggal || !noReg || !noRawat) {
  return { status: "DRAFT", blocked_reason: "Data tidak lengkap" };
}
```

### Rule 2: HFIS Snapshot Check

```typescript
const schedule = await prisma.doctorScheduleQuota.findFirst({
  where: { poli_id, dokter_id, tanggal },
});

if (!schedule) {
  return {
    status: "BLOCKED_BPJS",
    blocked_reason: "Jadwal dokter tidak ditemukan di snapshot HFIS",
  };
}
```

## 📊 Monitoring

### Lihat Event Bermasalah

```bash
GET http://localhost:3000/admin/events/blocked
```

**Response:**

```json
{
  "total": 15,
  "data": [
    {
      "id": "123",
      "visit_id": "2026/01/19/001234",
      "poli_id": "ANA",
      "dokter_id": "99999",
      "blocked_reason": "Jadwal dokter 99999 untuk poli ANA pada 2026-01-19 tidak ditemukan di snapshot HFIS",
      "event_time": "2026-01-19T08:30:00.000Z"
    }
  ]
}
```

### Statistik Status

```bash
GET http://localhost:3000/admin/events/stats
```

**Response:**

```json
{
  "DRAFT": 5,
  "READY_BPJS": 150,
  "BLOCKED_BPJS": 15,
  "SENT_BPJS": 1200,
  "FAILED_BPJS": 3
}
```

## 🛠️ Workflow Admin

### Skenario: Ada Event BLOCKED

1. **Identifikasi masalah:**

   ```bash
   GET /admin/events/blocked
   ```

2. **Analisis:**
   - Cek `blocked_reason`
   - Lihat apakah kode dokter/poli salah input
   - Cek apakah jadwal belum di-refresh dari HFIS

3. **Fix:**

   **Opsi A: Update snapshot HFIS**

   ```bash
   POST /admin/quota/refresh
   {
     "poli": ["ANA"],
     "tanggal": ["2026-01-19"]
   }
   ```

   **Opsi B: Fix data di Khanza**
   - Update kode dokter/poli di registrasi Khanza
   - Re-poll akan create event baru dengan data benar

4. **Revalidasi:**

   ```bash
   # Revalidasi semua blocked events
   POST /admin/events/revalidate-all
   ```

5. **Verify:**
   ```bash
   GET /admin/events/stats
   # BLOCKED_BPJS count should decrease
   ```

## 🎯 Benefits

✅ **Preventif** - Cegah data invalid masuk queue  
✅ **Traceable** - Jelas mana data bermasalah dan kenapa  
✅ **Auditable** - History lengkap dengan reason  
✅ **Recoverable** - Revalidasi otomatis setelah fix  
✅ **Observable** - Monitoring via API endpoint

## 📝 Database Schema

```prisma
model VisitEvent {
  // ... fields lain
  status         VisitEventStatus @default(DRAFT)
  blocked_reason String?          @db.VarChar(255)

  @@index([status])
}

enum VisitEventStatus {
  DRAFT
  READY_BPJS
  BLOCKED_BPJS
  SENT_BPJS
  FAILED_BPJS
}
```

## 🔄 Integration Flow

```
┌──────────────┐
│ Khanza DB    │
│ (reg_periksa)│
└──────┬───────┘
       │ polling
       ▼
┌──────────────────┐
│ register.poller  │
│ + hfis.validator │
└──────┬───────────┘
       │
       ├─ DRAFT ──────────────┐
       ├─ READY_BPJS ─────┐   │
       ├─ BLOCKED_BPJS ───│───┼─→ Skip Queue
       │                  │   │
       │                  ▼   │
       │         ┌─────────────────┐
       │         │ queue.builder   │
       │         │ (READY_BPJS only)│
       │         └────────┬─────────┘
       │                  │
       │                  ▼
       │         ┌─────────────┐
       │         │ queue.worker│
       │         └──────┬──────┘
       │                │
       │                ├─ Success → SENT_BPJS
       │                └─ Failed  → FAILED_BPJS
       │
       └──────→ Audit API (revalidate)
```

## 🚀 Next Steps

- [ ] Dashboard UI untuk monitoring blocked events
- [ ] Auto-retry revalidasi setiap hari
- [ ] Alert notification untuk BLOCKED events
- [ ] Export blocked events ke CSV untuk analisa

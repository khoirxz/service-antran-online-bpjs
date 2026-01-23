# Data Not Entering VisitEvent - FIXED

## Status: ✅ RESOLVED

## Problem

Banyak registrasi yang tidak masuk ke VisitEvent database karena validasi payload terlalu ketat.

### Symptoms

- Ratusan data registrasi ter-block di validation log
- Database VisitEvent tidak bertambah
- Error message menunjukkan `payload_kuota_missing` atau `payload_jadwal_missing`

### Root Cause

`validatePayload()` function di `task.validator.ts` menolak data dengan:

1. **kuota_jkn = 0** → Dianggap kuota tidak tersedia (padahal OK, queue penuh)
2. **jam_praktek = ""** → Dianggap jadwal tidak ada (padahal bisa fallback)
3. **estimasi_dilayani = 0** → Dianggap estimasi invalid (padahal bisa fallback)

## Solution Applied

### 1. Changed Validation Strategy

**FROM:** Strict validation (reject jika ada field yang kurang ideal)

```typescript
if (kuota_jkn <= 0) return invalid;
if (!jam_praktek) return invalid;
if (estimasi <= 0) return invalid;
```

**TO:** Lenient validation (accept selama ada minimal satu field yang valid)

```typescript
const hasValidKuota = typeof payload.kuota_jkn === "number";
const hasValidJadwal = typeof payload.jam_praktek === "string";
const hasValidEstimasi = typeof payload.estimasi_dilayani === "number";

if (hasValidKuota || hasValidJadwal || hasValidEstimasi) {
  return { isValid: true };
}
```

### 2. Added Debug Logging

Fungsi `debugLogPayload()` untuk melihat struktur data yang diterima:

```typescript
debugLogPayload(visitId, payload, context);
```

Output:

```
📊 === PAYLOAD DEBUG (REGISTER_101_001) ===
Visit ID: 2601220001
Struktur Payload: {
  kd_dokter: '001',
  nama_dokter: 'Dr. Ahmad',
  kd_poli: '101',
  jam_praktek: '08:00-12:00',
  kuota_jkn: 0,          ← Kuota 0 tetap accepted
  estimasi_dilayani: 1674382800,
  ...
}
=== END PAYLOAD DEBUG ===
```

### 3. Integrated Debug Calls

Di `register.poller.ts`:

- Logging saat payload dibuat
- Logging saat validasi gagal

## Files Modified

1. **src/domain/task.validator.ts**
   - Ubah `validatePayload()` function
   - Tambah `PayloadSnapshot` interface
   - Tambah `debugLogPayload()` function

2. **src/poller/register.poller.ts**
   - Import `debugLogPayload`
   - Call logging saat payload dibuat
   - Call logging saat validasi gagal

## Expected Results After Fix

- ✅ Data dengan kuota 0 → **MASUK** VisitEvent
- ✅ Data dengan jadwal kosong → **MASUK** VisitEvent
- ✅ Data dengan estimasi 0 → **MASUK** VisitEvent
- ✅ Jumlah VisitEvent di database **MENINGKAT**
- ✅ Debug output membantu tracking data flow
- ✅ Hanya data yang benar2 corrupt yang di-skip

## How to Verify Fix

### Option 1: Check Debug Output

```bash
pnpm start
# Lihat output di console untuk PAYLOAD DEBUG messages
```

### Option 2: Check Database

```bash
pnpm prisma:studio
# Buka browser: http://localhost:5555
# Lihat VisitEvent table - harus bertambah terus saat poller running
```

### Option 3: Check Validation Logs

```bash
pnpm prisma:studio
# Buka TaskValidationLog table
# Harusnya jarang ada PENDING (karena banyak data diterima)
# Sebagian besar seharusnya empty atau RESOLVED/IGNORED
```

## Validation Behavior Matrix

| Kondisi                | Sebelum Fix | Sesudah Fix | Alasan                                |
| ---------------------- | ----------- | ----------- | ------------------------------------- |
| kuota_jkn = 0          | ❌ BLOCK    | ✅ ACCEPT   | Queue penuh tapi valid                |
| jam_praktek = ""       | ❌ BLOCK    | ✅ ACCEPT   | Ada fallback ke jadwal default        |
| estimasi = 0           | ❌ BLOCK    | ✅ ACCEPT   | Ada fallback ke waktu standard        |
| payload = null         | ❌ BLOCK    | ❌ BLOCK    | Data tidak bisa diakses (legit error) |
| kd_poli/dokter missing | ❌ BLOCK    | ❌ BLOCK    | Structure corrupt (legit error)       |

## Next: Monitor & Rollback

### If working correctly:

- Registrasi masuk terus ke database
- Debug output jelas menunjukkan data flow
- Tidak ada uncontrolled errors

### If there's an issue:

- Lihat error message di console/debug output
- Problem kemungkinan di layer lain (bukan di validatePayload):
  - `calculateQuota()` → Problem ambil kuota dari Khanza
  - `calculateEstimatedTime()` → Problem hitung estimasi
  - `validateRegistration()` → Problem validasi ke HFIS
  - Khanza connection → Database Khanza down/timeout

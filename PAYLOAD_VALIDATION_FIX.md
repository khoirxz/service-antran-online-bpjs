# Payload Validation Fix - January 22, 2026

## Problem

Data tidak masuk ke VisitEvent karena validasi payload terlalu ketat (STRICT mode):

- Menolak data dengan `kuota_jkn = 0` (dianggap tidak ada kuota, padahal OK)
- Menolak data dengan `jam_praktek = ""` (dianggap jadwal kosong, padahal bisa fallback)
- Menolak data dengan `estimasi_dilayani = 0` (dianggap estimasi invalid)

Akibatnya: **Ratusan registrasi blok di log validation, tidak masuk database**

## Root Cause

`validatePayload()` di `task.validator.ts` menggunakan STRICT validation:

```typescript
// SEBELUM (STRICT - REJECT):
if (kuota_jkn <= 0) return invalid; // ❌ Reject jika kuota habis
if (!jam_praktek) return invalid; // ❌ Reject jika jadwal kosong
if (estimasi <= 0) return invalid; // ❌ Reject jika estimasi 0
```

## Solution

Ubah ke LENIENT validation - terima data selama ada minimal:

```typescript
// SESUDAH (LENIENT - ACCEPT):
// Hanya reject jika payload benar2 null/corrupt
const hasValidKuota = typeof payload.kuota_jkn === "number";
const hasValidJadwal = typeof payload.jam_praktek === "string";
const hasValidEstimasi = typeof payload.estimasi_dilayani === "number";

if (hasValidKuota || hasValidJadwal || hasValidEstimasi) {
  return { isValid: true }; // ✅ Terima jika ada salah satu field
}
```

## Changes Made

### 1. Modified: `src/domain/task.validator.ts`

- Ubah `validatePayload()` dari strict ke lenient mode
- Hanya reject jika payload benar2 kosong/null
- Kuota 0 tetap OK (queue penuh, tapi pasien bisa tunggu)
- Jadwal kosong tetap OK (ada fallback di BPJS caller)
- Estimasi 0 tetap OK (fallback ke waktu standard)

### 2. Modified: `src/poller/register.poller.ts`

- Tambah import `debugLogPayload`
- Panggil `debugLogPayload()` saat payload dibuat
- Panggil `debugLogPayload()` saat validasi gagal (untuk debugging)

## Debug Output

Sekarang saat running poller, akan lihat:

```
📊 === PAYLOAD DEBUG (REGISTER_101_001) ===
Visit ID: 2601220001
Struktur Payload: {
  kd_dokter: '001',
  nama_dokter: 'Dr. Ahmad',
  kd_poli: '101',
  nama_poli: 'Umum',
  jam_praktek: '08:00-12:00',
  kuota_jkn: 0,           // ← Kuota habis tapi tetap diterima
  estimasi_dilayani: 1674382800,
  ...
}
=== END PAYLOAD DEBUG ===
```

## Impact

- ✅ Data dengan kuota 0 akan masuk VisitEvent
- ✅ Data dengan jadwal kosong akan masuk VisitEvent
- ✅ Data dengan estimasi 0 akan masuk VisitEvent
- ✅ Lebih banyak registrasi masuk ke queue
- ✅ Admin bisa lihat data di database (sebelumnya hidden di validation log)
- ✅ Fallback mechanisms bekerja saat payload imperfect

## Next Steps (jika masih ada issue)

1. Jalankan poller: `pnpm start`
2. Lihat debug output untuk payload structure
3. Check database: `prisma studio` → lihat VisitEvent
4. Jika ada error saat send ke BPJS, itu masalah di caller code (bukan di poller)

## Validation Rules Summary

| Field                    | Behavior Before | Behavior After | Notes                                 |
| ------------------------ | --------------- | -------------- | ------------------------------------- |
| `kuota_jkn = 0`          | ❌ REJECT       | ✅ ACCEPT      | Kuota habis tapi OK, pasien tunggu    |
| `jam_praktek = ""`       | ❌ REJECT       | ✅ ACCEPT      | Jadwal kosong OK, ada fallback        |
| `estimasi_dilayani = 0`  | ❌ REJECT       | ✅ ACCEPT      | Estimasi 0 OK, ada fallback           |
| `payload = null`         | ❌ REJECT       | ❌ REJECT      | Still reject (tidak bisa diproses)    |
| `kd_poli/dokter missing` | ❌ REJECT       | ❌ REJECT      | Still reject (data structure corrupt) |

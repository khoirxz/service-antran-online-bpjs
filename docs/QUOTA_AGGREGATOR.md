# Quota Aggregator - Sistem Hybrid Kuota BPJS

## 📌 Masalah yang Dipecahkan

Sebelumnya, sistem menggunakan **hardcode** untuk menghitung kuota:

```typescript
sisakuotajkn: row.kuota_jkn - parseInt(row.no_reg, 10);
```

**Masalahnya:**

- `kuota_jkn` dari DB Khanza **jarang diupdate** oleh staff
- Nomor antrean bisa **melebihi kuota** yang tersimpan
- Data kuota **tidak sinkron** dengan BPJS

## ✅ Solusi: Quota Aggregator

Sistem **hybrid** yang menggabungkan:

1. **Data BPJS API** (jadwal dokter + kapasitas real-time)
2. **Data Lokal** (jumlah registrasi dari Khanza)

### Arsitektur

```
┌─────────────────┐
│   BPJS API      │ ← Fetch jadwal dokter (setiap pagi jam 05:00)
│  (kapasitas)    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ DoctorScheduleQuota     │ ← Snapshot/Cache (TTL: 1 hari)
│ - poli_id               │
│ - dokter_id             │
│ - tanggal               │
│ - kuota_jkn: 54         │ ← Data dari BPJS
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  QuotaAggregator        │ ← Service untuk hitung kuota real-time
│                         │
│  kuota_jkn (BPJS)       │
│  - total_registrasi     │ ← Hitung dari reg_periksa
│  = sisa_kuota_jkn       │ ← Hasil akhir yang akurat
└─────────────────────────┘
```

## 🚀 Cara Penggunaan

### 1. Refresh Jadwal Dokter (Manual)

Gunakan API endpoint untuk refresh snapshot:

```bash
POST http://localhost:3000/admin/quota/refresh
Content-Type: application/json

{
  "poli": ["ANA", "BED", "INT"],
  "tanggal": ["2026-01-19", "2026-01-20"]
}
```

**Response:**

```json
{
  "message": "Manual refresh dimulai",
  "poli": ["ANA", "BED", "INT"],
  "tanggal": ["2026-01-19", "2026-01-20"]
}
```

### 2. Hitung Kuota Real-Time

```bash
GET http://localhost:3000/admin/quota/calculate?poli=ANA&dokter=33690&tanggal=2026-01-19
```

**Response:**

```json
{
  "poli_id": "ANA",
  "poli_name": "Anak",
  "dokter_id": "33690",
  "tanggal": "2026-01-19",
  "jam_praktek": "08:00-12:00",
  "kuota_jkn": 54,
  "total_registrasi": 12,
  "sisa_kuota_jkn": 42,
  "kuota_nonjkn": 16,
  "sisa_kuota_nonjkn": 4
}
```

### 3. Lihat Snapshot Jadwal

```bash
GET http://localhost:3000/admin/quota/snapshots?tanggal=2026-01-19&poli=ANA
```

### 4. Monitoring Queue Status

```bash
GET http://localhost:3000/admin/queue/status
```

## ⚙️ Konfigurasi

### Scheduler Otomatis

Sistem akan **otomatis refresh** jadwal dokter setiap pagi jam **05:00 WIB**.

Edit daftar poli di [quota.scheduler.ts](src/scheduler/quota.scheduler.ts):

```typescript
const POLI_LIST = [
  "ANA", // Anak
  "BED", // Bedah
  "INT", // Penyakit Dalam
  // ... tambahkan sesuai kebutuhan
];
```

### Policy Kuota Non-JKN

Saat ini: **30% dari kuota JKN**

Edit di [quota.aggregator.ts](src/domain/quota.aggregator.ts):

```typescript
const kuotaNonJkn = Math.floor(schedule.kuota_jkn * 0.3);
```

### Estimasi Waktu Dilayani

Formula: `jam_mulai + (nomor_antrean × 6 menit)`

Edit di [quota.aggregator.ts](src/domain/quota.aggregator.ts):

```typescript
date.setMinutes(date.getMinutes() + nomorAntrean * 6);
```

## 📊 Database Schema

### DoctorScheduleQuota (Snapshot)

```prisma
model DoctorScheduleQuota {
  id          BigInt   @id @default(autoincrement())
  dokter_id   String
  poli_id     String
  tanggal     DateTime
  jam_mulai   String
  jam_selesai String
  kuota_jkn   Int      ← Dari BPJS API
  source      String   ← "BPJS_HFIS"
  fetchedAt   DateTime ← Timestamp refresh
}
```

## 🔄 Alur Kerja Lengkap

1. **Scheduler** refresh jadwal dari BPJS setiap pagi (05:00)
2. **Poller** deteksi registrasi baru dari Khanza
3. **QuotaAggregator** hitung sisa kuota real-time
4. **PayloadBuilder** build payload dengan data kuota yang akurat
5. **Worker** kirim ke BPJS API

## 🎯 Keuntungan

✅ **Akurat** - Data kuota dari BPJS langsung, bukan hardcode
✅ **Real-time** - Menghitung sisa kuota berdasarkan registrasi aktual
✅ **Scalable** - Cache/snapshot untuk performa optimal
✅ **Flexible** - Policy kuota Non-JKN bisa disesuaikan
✅ **Observable** - API endpoint untuk monitoring

## 📝 TODO

- [ ] Tambah alert jika kuota penuh
- [ ] Support multiple shift jadwal dokter
- [ ] Dashboard monitoring UI
- [ ] Rate limiting untuk BPJS API calls

# ANTREAN ONLINE (BPJS SERVICE)

ANTREAN ONLINE (BPJS SERVICE)
Service ini dibuat untuk memudahkan pengiriman antrean online ke BPJS. Terutama yang masih mendapatkan kendala pada pengiriman antrean melalui SIMRS Khanza.

## 📚 Documentation

**Start here:**

- **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** - Directory layout & architecture overview
- **[src/domain/README.md](src/domain/README.md)** - Business logic & domain functions

**Implementation Guides:**

- **[IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)** - Refactored VisitEvent structure
- **[DATA_FLOW.md](DATA_FLOW.md)** - Visual data flow diagrams
- **[REFACTOR_SUMMARY.md](REFACTOR_SUMMARY.md)** - Technical refactoring details
- **[Quick_Reference.md](Quick_Reference.md)** - Code snippets & quick lookup

## Project Overview

```
ANTREAN SERVICE
├─ Pollers (Khanza → Database)
│   ├─ REGISTER events
│   ├─ CHECKIN/START/FINISH events
│   └─ Watermark-based incremental sync
│
├─ Domain Layer (Business Logic)
│   ├─ Validation (HFIS snapshot check)
│   ├─ Quota calculation
│   └─ Payload building
│
├─ Queue System (Async Processing)
│   ├─ Queue builder (enqueue jobs)
│   └─ Queue worker (send to BPJS)
│
└─ Admin APIs (Monitoring)
    ├─ Queue status
    ├─ Blocked events
    └─ Quota info
```

│ │
│ ├─ storage/
│ │ ├─ event.repository.ts
│ │ └─ polling.state.ts
│ │
│ ├─ api/
│ │ ├─ admin.routes.ts # retry / replay
│ │ └─ health.routes.ts
│ │
│ ├─ app.ts
│ └─ server.ts
│
├─ migrations/
├─ .env
├─ package.json
└─ README.md

````

### Tambah Antrean

**Endpoint:** `POST /antrean/add`

**Fungsi:** Menambah Antrean ke BPJS

**Request Body:**

| Field              | Type      | Description                                                                |
| :----------------- | :-------- | :------------------------------------------------------------------------- |
| `kodebooking`      | `string`  | Kode booking yang dibuat unik.                                             |
| `jenispasien`      | `string`  | Jenis pasien (JKN / NON JKN).                                              |
| `nomorkartu`       | `string`  | Nomor kartu pasien BPJS. Diisi kosong jika NON JKN.                        |
| `nik`              | `string`  | NIK pasien.                                                                |
| `nohp`             | `string`  | No HP pasien.                                                              |
| `kodepoli`         | `string`  | Memakai kode subspesialis BPJS.                                            |
| `namapoli`         | `string`  | Nama poli.                                                                 |
| `pasienbaru`       | `integer` | 1 (Ya), 0 (Tidak).                                                         |
| `norm`             | `string`  | No rekam medis pasien.                                                     |
| `tanggalperiksa`   | `string`  | Tanggal periksa (format: YYYY-MM-DD).                                      |
| `kodedokter`       | `integer` | Kode dokter BPJS.                                                          |
| `namadokter`       | `string`  | Nama dokter.                                                               |
| `jampraktek`       | `string`  | Jam praktek dokter (format: HH:mm-HH:mm).                                  |
| `jeniskunjungan`   | `integer` | 1 (Rujukan FKTP), 2 (Rujukan Internal), 3 (Kontrol), 4 (Rujukan Antar RS). |
| `nomorreferensi`   | `string`  | No rujukan/kontrol pasien JKN. Diisi kosong jika NON JKN.                  |
| `nomorantrean`     | `string`  | Nomor antrean pasien.                                                      |
| `angkaantrean`     | `integer` | Angka antrean.                                                             |
| `estimasidilayani` | `integer` | Waktu estimasi dilayani dalam miliseconds.                                 |
| `sisakuotajkn`     | `integer` | Sisa kuota JKN.                                                            |
| `kuotajkn`         | `integer` | Kuota JKN.                                                                 |
| `sisakuotanonjkn`  | `integer` | Sisa kuota non JKN.                                                        |
| `kuotanonjkn`      | `integer` | Kuota non JKN.                                                             |
| `keterangan`       | `string`  | Informasi untuk pasien.                                                    |

**Contoh Request:**

```json
{
  "kodebooking": "16032021A001",
  "jenispasien": "JKN",
  "nomorkartu": "00012345678",
  "nik": "3212345678987654",
  "nohp": "085635228888",
  "kodepoli": "ANA",
  "namapoli": "Anak",
  "pasienbaru": 0,
  "norm": "123345",
  "tanggalperiksa": "2021-01-28",
  "kodedokter": 12345,
  "namadokter": "Dr. Hendra",
  "jampraktek": "08:00-16:00",
  "jeniskunjungan": 1,
  "nomorreferensi": "0001R0040116A000001",
  "nomorantrean": "A-12",
  "angkaantrean": 12,
  "estimasidilayani": 1615869169000,
  "sisakuotajkn": 5,
  "kuotajkn": 30,
  "sisakuotanonjkn": 5,
  "kuotanonjkn": 30,
  "keterangan": "Peserta harap 30 menit lebih awal guna pencatatan administrasi."
}
````

### Update Antrean

**Endpoint:** `POST /antrean/update`

**Fungsi:** Merubah waktu task id di BPJS

**Request Body:**

| Field         | Type      | Description                       |
| :------------ | :-------- | :-------------------------------- |
| `kodebooking` | `string`  | Kode booking.                     |
| `taskid`      | `string`  | Task ID.                          |
| `waktu`       | `integer` | Waktu dalam timestamp milisecond. |

**Contoh Request:**

```json
{
  "kodebooking": "16032021A001",
  "taskid": "3",
  "waktu": 1615869169000
}
```

### Batal Antrean

**Endpoint:** `POST /antrean/batal`

**Fungsi:** Membatalkan antrean di BPJS

**Request Body:**

| Field         | Type     | Description   |
| :------------ | :------- | :------------ |
| `kodebooking` | `string` | Kode booking. |
| `keterangan`  | `string` | Keterangan.   |

**Contoh Request:**

```json
{
  "kodebooking": "16032021A001",
  "keterangan": "Terjadi perubahan jadwal dokter"
}
```

### List Task

**Endpoint:** `POST /antrean/getlisttask`

**Fungsi:** Mendapatkan daftar task id dari kode booking

**Request Body:**

| Field         | Type     | Description   |
| :------------ | :------- | :------------ |
| `kodebooking` | `string` | Kode booking. |

**Contoh Request:**

```json
{
  "kodebooking": "16032021A001"
}
```

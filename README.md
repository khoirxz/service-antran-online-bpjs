# ANTREAN ONLINE (BPJS SERVICE)

ANTREAN ONLINE (BPJS SERVICE)
Service ini dibuat untuk memudahkan pengiriman antrean online ke BPJS. Terutama yang masih mendapatkan kendala pada pengiriman antrean melalui SIMRS Khanza.

```
bpjs-antrean-service/
├─ src/
│  ├─ config/
│  │  ├─ bpjs.config.ts
│  │  ├─ db.config.ts
│  │  └─ app.config.ts
│  │
│  ├─ khanza/
│  │  ├─ khanza.client.ts        # koneksi read-only ke DB Khanza
│  │  └─ khanza.poller.ts        # polling engine
│  │
│  ├─ domain/
│  │  ├─ event.model.ts          # event internal (REGISTER, CHECKIN, dll)
│  │  ├─ task.mapper.ts          # event → taskId
│  │  └─ payload.builder.ts      # build payload BPJS
│  │
│  ├─ queue/
│  │  ├─ queue.model.ts
│  │  ├─ queue.repository.ts
│  │  └─ queue.worker.ts         # sender ke BPJS
│  │
│  ├─ bpjs/
│  │  ├─ bpjs.client.ts          # HTTP client BPJS
│  │  └─ bpjs.signature.ts       # header & signature
│  │
│  ├─ storage/
│  │  ├─ event.repository.ts
│  │  └─ polling.state.ts
│  │
│  ├─ api/
│  │  ├─ admin.routes.ts         # retry / replay
│  │  └─ health.routes.ts
│  │
│  ├─ app.ts
│  └─ server.ts
│
├─ migrations/
├─ .env
├─ package.json
└─ README.md
```

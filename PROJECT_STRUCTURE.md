# Project Structure Guide

## Directory Layout

```
src/
├── api/                    # Express routes for admin/monitoring
│   ├── admin.routes.ts     # Admin endpoints (quota, poli)
│   ├── audit.routes.ts     # Queue monitoring (pending, sent, failed)
│   ├── health.routes.ts    # Health check
│   └── quota.routes.ts     # Quota info endpoints
│
├── bpjs/                   # BPJS API integration
│   ├── bpjs.client.ts      # HTTP client with signature/encryption
│   └── bpjs.signature.ts   # HMAC-SHA256 + AES-256-CBC signing
│
├── config/                 # Configuration
│   ├── app.config.ts       # Port, env vars
│   ├── bpjs.config.ts      # BPJS API credentials
│   └── khanza.config.ts    # Khanza DB connection
│
├── domain/                 # Business logic (❌ CLEANED UP)
│   ├── hfis.validator.ts   # Validate data against HFIS snapshot
│   ├── quota.aggregator.ts # Calculate quota & wait times
│   ├── poli.aggregator.ts  # Sync clinic data from BPJS
│   ├── queue.payload.ts    # Build BPJS API payloads
│   ├── task.mapper.ts      # Event type → task ID mapping
│   ├── task.progress.ts    # Track task progress in JSON
│   └── README.md           # 📄 Domain layer documentation
│
├── khanza/                 # Khanza (SIMRS) integration
│   ├── khanza.client.ts    # Database connection
│   └── khanza.query.ts     # SQL queries (read-only)
│
├── lib/                    # Utilities & shared libraries
│   └── prisma.ts           # Prisma client singleton
│
├── poller/                 # Background pollers (sync data from Khanza)
│   ├── register.poller.ts  # REGISTER events (1/minute)
│   ├── task3.poller.ts     # CHECKIN events (1/minute)
│   ├── task4.poller.ts     # START events (1/minute)
│   └── task5.poller.ts     # FINISH events (1/minute)
│
├── queue/                  # Queue processing
│   ├── queue.builder.ts    # Create BpjsAntreanQueue jobs
│   └── queue.worker.ts     # Process jobs → Send to BPJS
│
├── scheduler/              # Cron jobs
│   ├── poller.scheduler.ts # Start all pollers (1/min each)
│   ├── queue.scheduler.ts  # Build queue (1/min)
│   └── worker.scheduler.ts # Process queue (5/sec)
│
├── storage/                # State management
│   └── polling.state.ts    # Watermark timestamps (incremental sync)
│
├── utils/                  # Helper functions
│   ├── bigInt.ts           # BigInt serialization
│   └── formatDate.ts       # UTC-safe date handling
│
├── app.ts                  # Express app setup
└── server.ts               # Start server + schedulers
```

## Removed (Cleanup)

❌ `src/domain/payload.builder.ts` - Orphaned (not used anywhere)
❌ `src/domain/visit-event.model.ts` - Replaced by Prisma types
❌ `src/domain/visit-event.factory.ts` - Not used, legacy code
❌ `src/domain/bpjs.validator.ts` - Not used (replaced by hfis.validator)
❌ `src/poller/snapshotDokter.ts` - Empty file, not used

## Key Directories

### 🔄 Data Flow: REGISTER

```
Khanza → register.poller.ts
  ↓ validateHfisData()
  ↓ calculateQuota()
  ↓ CREATE VisitEvent (status: READY_BPJS)
  ↓ (stored in DB)

queue.builder.ts (1/min)
  ↓ Find READY_BPJS events
  ↓ buildRegisterPayload()
  ↓ CREATE BpjsAntreanQueue (task_id=1)

queue.worker.ts (5/sec)
  ↓ Pick PENDING job
  ↓ Send to BPJS /antrean/add
  ↓ UPDATE VisitEvent.status = SENT_BPJS
  ↓ Log response
```

### 🔄 Data Flow: CHECKIN/START/FINISH

```
Khanza → task3/4/5.poller.ts (1/min each)
  ↓ Check Khanza task_id_3/4/5 columns
  ↓ UPDATE VisitEvent.task_progress["3"/"4"/"5"] = DRAFT

queue.builder.ts (1/min)
  ↓ Find task_progress entries
  ↓ Verify REGISTER already SENT_BPJS
  ↓ buildTaskUpdatePayload()
  ↓ CREATE BpjsAntreanQueue (task_id=3/4/5)

queue.worker.ts (5/sec)
  ↓ Pick PENDING job
  ↓ Send to BPJS /antrean/updatewaktu
  ↓ UPDATE VisitEvent.task_progress["3"/"4"/"5"].status = SENT_BPJS
  ↓ Log response
```

## Development Workflow

### Adding a New Poller

1. Create `src/poller/taskX.poller.ts`
2. Export async function `pollTaskIdXEvent()`
3. Use `ensurePollingState()` for watermark
4. Register in `src/scheduler/poller.scheduler.ts`

### Adding a New API Endpoint

1. Create route in `src/api/resource.routes.ts`
2. Import in `src/app.ts`
3. Add to `router.use()` in Express setup

### Adding Domain Logic

1. Create `src/domain/feature.ts`
2. Export functions
3. Update `src/domain/README.md` documentation

## Important Files to Know

| File                   | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `prisma/schema.prisma` | Database schema (VisitEvent, BpjsAntreanQueue, etc) |
| `docker-compose.yml`   | MySQL, MariaDB setup                                |
| `package.json`         | Dependencies (express, prisma, axios)               |
| `.env`                 | BPJS credentials, DB connections (⚠️ never commit)  |

## Testing

### Unit Tests

```bash
# Test individual functions
npx jest src/domain/quota.aggregator.test.ts
```

### Integration Tests

```bash
# Test pollers → queue → worker flow
npm run test:integration
```

### Manual Testing

```bash
# Start dev server with hot reload
npm run dev

# Check health
curl http://localhost:3000/health

# Check queue status
curl http://localhost:3000/admin/queue/stats

# View blocked events
curl http://localhost:3000/admin/events/blocked
```

## Deployment

1. **Build:** `npm run build`
2. **Migrate:** `npx prisma migrate deploy`
3. **Start:** `npm start`

Runs with:

- Quota aggregator (daily 05:00)
- Poli sync (weekly Monday 06:00)
- Pollers (every 1 minute)
- Queue builder (every 1 minute)
- Queue worker (every 5 seconds)

## Best Practices

✅ **Always use HFIS data for BPJS submission**

- Never trust Khanza for doctor names, schedules
- Validate against DoctorScheduleQuota (HFIS snapshot)

✅ **Single VisitEvent per visit**

- One record per `visit_id`
- All task statuses in `task_progress` JSON

✅ **Fail fast on validation**

- Reject invalid registrations early
- Throw clear error messages

✅ **Immutable payloads**

- Build once, store, send
- Don't modify after queueing

✅ **Log everything**

- BpjsAntreanLogs captures all requests/responses
- Helpful for debugging BPJS rejections

## Common Commands

```bash
# Check compilation
npx tsc --noEmit

# Format code
npx prettier --write src/

# View logs
docker-compose logs -f mysql
docker-compose logs -f app

# Reset database (dev only!)
npx prisma migrate reset

# View Prisma Studio
npx prisma studio

# Run specific test
npm test -- queue.worker.test.ts
```

## Architecture Principles

1. **Separation of Concerns**
   - Pollers: Data ingestion
   - Domain: Business logic
   - Queue: Async processing
   - API: User interface

2. **Single Responsibility**
   - Each file does one thing well
   - Functions are small and testable
   - No mixing of concerns

3. **Fail Fast**
   - Validate early
   - Log errors clearly
   - Don't silently ignore issues

4. **Audit Trail**
   - Every BPJS API call logged
   - Every status change tracked
   - Every error recorded

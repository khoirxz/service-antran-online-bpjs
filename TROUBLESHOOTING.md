# Troubleshooting Guide

Panduan untuk memecahkan common issues pada ANTREAN ONLINE BPJS Service.

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Database Issues](#database-issues)
3. [BPJS API Issues](#bpjs-api-issues)
4. [Schedule & Quota Issues](#schedule--quota-issues)
5. [Performance Issues](#performance-issues)
6. [Debugging Tips](#debugging-tips)

---

## Installation Issues

### Issue: `pnpm install` fails

**Error Message:**

```
ERR_PNPM_UNSUPPORTED_ENGINE
```

**Solution:**

```bash
# Check Node.js version (need 18+)
node --version

# Upgrade Node.js jika perlu
# https://nodejs.org/

# Try reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Issue: TypeScript build errors

**Error:**

```
error TS2307: Cannot find module 'X'
```

**Solution:**

```bash
# Ensure all dependencies installed
pnpm install

# Clear cache & rebuild
pnpm store prune
pnpm run build

# Check tsconfig.json paths
cat tsconfig.json | grep paths
```

### Issue: `prisma` command not found

**Error:**

```
zsh: command not found: prisma
```

**Solution:**

```bash
# Use pnpm exec
pnpm exec prisma --version

# Or install globally
pnpm install -g @prisma/cli

# Or use npx
npx prisma --version
```

---

## Database Issues

### Issue: Cannot connect to database

**Error:**

```
Can't reach database server at ...
```

**Solutions:**

1. **Check MySQL is running:**

   ```bash
   # If using Docker
   docker-compose ps
   docker-compose up -d

   # If installed locally
   mysql --version
   mysql -u root -p
   ```

2. **Check DATABASE_URL:**

   ```bash
   # .env.local should have:
   DATABASE_URL="mysql://root:password@localhost:3306/antrol"

   # Test connection
   mysql -u root -p -h localhost -e "SELECT 1"
   ```

3. **Check credentials:**
   ```bash
   # Verify MySQL root password
   # If docker-compose: check in docker-compose.yml
   docker-compose config | grep MYSQL_ROOT_PASSWORD
   ```

### Issue: Prisma migration fails

**Error:**

```
Error: P3015 error
Error: SASL authentication failed
```

**Solutions:**

1. **Reset database (⚠️ DANGEROUS - will delete all data):**

   ```bash
   # Backup first!
   mysqldump -u root -p antrol > backup.sql

   # Reset
   pnpm exec prisma migrate reset --force

   # Or manual
   mysql -u root -p antrol -e "DROP DATABASE antrol; CREATE DATABASE antrol;"
   pnpm exec prisma migrate deploy
   ```

2. **Check migration files:**

   ```bash
   # View migration history
   pnpm exec prisma migrate status

   # If migration file broken, edit or delete from prisma/migrations/
   ls -la prisma/migrations/
   ```

### Issue: Schema drift detected

**Error:**

```
⚠️  Schema drift: The database schema is not in sync with your migrations
```

**Solution:**

```bash
# Option 1: Update migrations to match schema
pnpm exec prisma migrate resolve --rolled-back 20260113030224_init

# Option 2: Create new migration
pnpm exec prisma migrate dev --name fix_schema_drift

# Option 3: Reset (caution!)
pnpm exec prisma migrate reset --force
```

---

## BPJS API Issues

### Issue: BPJS authentication fails

**Error:**

```
Authentication failed: Invalid KONSID or secret
```

**Solution:**

1. **Check credentials in .env:**

   ```bash
   grep BPJS .env.local
   # Should show:
   # BPJS_KONSID="your-konsid"
   # BPJS_SECRET="your-secret"
   ```

2. **Verify BPJS setup:**
   - Contact BPJS untuk valid KONSID/SECRET
   - Check signature algorithm (`src/bpjs/bpjs.signature.ts`)
   - Verify timestamp format (should be current time)

3. **Test BPJS connectivity:**

   ```bash
   # Add debug log
   console.log("BPJS_KONSID:", process.env.BPJS_KONSID);
   console.log("BPJS_SECRET exists:", !!process.env.BPJS_SECRET);

   # Then test
   npm run build && npm run start
   ```

### Issue: BPJS API timeout

**Error:**

```
BPJS API request timeout (30s)
```

**Causes & Solutions:**

1. **BPJS server down:**

   ```bash
   # Circuit breaker will activate
   # Service falls back to last-known schedule
   # Check logs for circuit breaker indicators:
   # ⚠️ Circuit breaker open untuk poli...
   ```

2. **Network connectivity:**

   ```bash
   # Test connectivity
   curl -I https://bpjs-api.example.com

   # Check firewall/proxy settings
   ```

3. **Large data response:**
   ```bash
   # Increase timeout in bpjs.client.ts
   // From:
   const response = await fetch(..., { timeout: 30000 });
   // To:
   const response = await fetch(..., { timeout: 60000 });
   ```

### Issue: BPJS rate limit exceeded

**Error:**

```
429 Too Many Requests
```

**Causes & Solutions:**

1. **Too many concurrent refresh requests:**

   ```bash
   # Check RefreshLock stats
   const stats = getRefreshCacheStats();
   console.log("Refreshing:", stats.refreshing); // Should be low

   # If high, deduplication might not be working
   # Check schedule.cache.ts
   ```

2. **Batch refresh too aggressive:**

   ```typescript
   // In quota.scheduler.ts, reduce batch size or increase delay
   const BATCH_SIZE = 3; // Was 5
   const BATCH_DELAY = 1000; // Was 500ms
   ```

3. **Multiple refresh jobs running:**
   ```bash
   # Check if 5 AM, 12 PM, 5 PM jobs are triggering simultaneously
   # View logs around those times
   # Adjust cron schedules if needed
   ```

---

## Schedule & Quota Issues

### Issue: Schedule always missing

**Error:**

```
Snapshot jadwal tidak ditemukan untuk poli...
```

**Causes & Solutions:**

1. **Manual refresh not done:**

   ```bash
   # Trigger manual refresh via API or code
   pnpm exec prisma studio
   # Check DoctorScheduleQuota table (should be empty on first run)

   # Manually trigger refresh:
   # Add to server.ts or API endpoint:
   import { refreshDoctorScheduleFromBpjs } from "./domain/quota.aggregator";
   await refreshDoctorScheduleFromBpjs("001", "2026-01-21");
   ```

2. **Scheduler not running:**

   ```bash
   # Check if scheduler started
   # In server.ts, verify:
   import { startQuotaScheduler } from "./scheduler/quota.scheduler";
   startQuotaScheduler();

   # Check server logs:
   # 📅 Quota scheduler started: full refresh 05:00, light refresh 12:00 & 17:00 WIB
   ```

3. **Wrong date format:**
   ```bash
   # Ensure YYYY-MM-DD format
   // Wrong: "01-21-2026" or "21/01/2026"
   // Correct: "2026-01-21"
   ```

### Issue: Quota always zero

**Error:**

```
sisa_kuota_jkn: 0
```

**Causes & Solutions:**

1. **Registrations > kuota:**

   ```bash
   # Check actual registrations
   pnpm exec prisma studio
   # Query BpjsAntreanQueue table
   # If count > DoctorScheduleQuota.kuota_jkn, quota will be 0 (correct)
   ```

2. **Wrong calculation:**

   ```typescript
   // In quota.aggregator.ts, verify logic
   const sisaKuotaJkn = Math.max(0, schedule.kuota_jkn - totalRegistrasi);
   // Should be: kuota - registered = sisa
   ```

3. **Stale data:**
   ```bash
   # Check schedule fetchedAt timestamp
   # If old (>12 hours), manual refresh:
   await refreshDoctorScheduleFromBpjs("001", "2026-01-21");
   ```

### Issue: Registrasi blocked with BLOCKED_BPJS

**Error:**

```
Task blocked: BLOCKED_BPJS (kuota habis)
```

**Causes & Solutions:**

1. **Quota genuinely full:**

   ```bash
   # This is correct behavior if kuota = 0
   # Wait untuk schedule change atau next day
   ```

2. **Schedule not synced:**

   ```bash
   # Trigger refresh
   await refreshDoctorScheduleFromBpjs("001", "2026-01-21");

   # Or wait for next scheduled refresh (05:00, 12:00, 17:00)
   ```

---

## Performance Issues

### Issue: Registrasi latency too high (>1s)

**Causes & Solutions:**

1. **Database slow:**

   ```bash
   # Check query performance
   # Enable MySQL slow query log
   mysql> SET GLOBAL slow_query_log = 'ON';

   # Monitor query times
   pnpm exec prisma studio
   # Run queries manually to check time
   ```

2. **BPJS refresh in-progress:**

   ```bash
   # Check cache stats
   const stats = getRefreshCacheStats();
   if (stats.refreshing > 0) {
     console.log("Waiting for refresh:", stats.refreshing);
   }

   # If many refreshing, might be waiting max 3s
   # Reduce WAIT_TIMEOUT in quota.aggregator.ts
   ```

3. **Too many concurrent requests:**

   ```bash
   # Monitor concurrent connections
   # If > 10, might be database pool exhausted

   # In Prisma, increase connection pool:
   // prisma/schema.prisma
   datasource db {
     provider = "mysql"
     url      = env("DATABASE_URL")
     // Add ?pool_size=20
   }
   ```

### Issue: High BPJS API call rate

**Indicator:**

```
Total API calls today: 1000+ (should be ~90)
```

**Causes & Solutions:**

1. **Deduplication not working:**

   ```bash
   # Check cache stats
   const stats = getRefreshCacheStats();
   console.log("Refreshing count:", stats.refreshing);
   // If stays high, dedup might be broken

   # Verify getRefreshLock() works
   import { getRefreshLock, setRefreshLock } from "./domain/schedule.cache";
   setRefreshLock("001", "2026-01-21");
   const lock = getRefreshLock("001", "2026-01-21");
   console.log(lock); // Should not be undefined
   ```

2. **Circuit breaker stuck open:**

   ```bash
   # Check failed count
   const stats = getRefreshCacheStats();
   console.log("Failed:", stats.failed);
   // If high, circuit breaker stuck

   # Clear cache (temporary fix)
   import { clearRefreshCache } from "./domain/schedule.cache";
   clearRefreshCache();
   ```

3. **Multiple refresh jobs:**

   ```bash
   # Check scheduler logs
   // Should see 3 logs per day (5 AM, 12 PM, 5 PM)
   // If more, duplicate cron jobs registered

   # Fix: Ensure startQuotaScheduler() called only once
   // In server.ts or main app init
   ```

---

## Debugging Tips

### Enable Debug Logging

```typescript
// In relevant files
console.log("🔍 DEBUG:", {
  poliId,
  dokterId,
  tanggal,
  schedule: !!schedule,
  cacheHit: !!getRefreshLock(poliId, tanggal),
  circuitOpen: isCircuitOpen(poliId, tanggal),
});
```

### Monitor in Production

```typescript
// Add metrics collection
const metrics = {
  calculateQuota: {
    calls: 0,
    fallbackHits: 0,
    circuitBreakerHits: 0,
    avgLatency: 0,
  },
  refreshSchedule: {
    calls: 0,
    successes: 0,
    failures: 0,
  },
  bpjsApi: {
    calls: 0,
    errors: 0,
  },
};

// Log periodically
setInterval(() => {
  console.log("📊 Metrics:", metrics);
}, 300000); // Every 5 min
```

### Check Log Patterns

**Healthy System:**

```
05:00 - 🌅 Full refresh starts
05:00-05:30 - ✅ Refresh ✅ for 30 polis
05:30 - ✅ Full refresh complete

12:00 - ☀️ Light refresh starts
12:00-12:05 - ✅ Refresh ✅ for 30 polis
12:05 - ✅ Light refresh complete

(many registrations)
📡 Jadwal tidak ditemukan, refresh async...
🔄 Refresh sedang berjalan, menunggu...
(no circuit breaker logs)
```

**Problematic System:**

```
❌ BPJS API timeout
⚠️ Circuit breaker open untuk poli X
⚠️ Circuit breaker open untuk poli Y
⚠️ Circuit breaker open untuk poli Z
(many circuit breaker logs = BPJS down)

Or:

📡 Jadwal tidak ditemukan, refresh async...
📡 Jadwal tidak ditemukan, refresh async...
📡 Jadwal tidak ditemukan, refresh async...
(repeated = scheduler not running)
```

---

## Getting Help

### Check Logs

```bash
# View app logs
tail -f logs/app.log

# Filter for errors
tail -f logs/app.log | grep "ERROR\|❌"

# Filter for performance
tail -f logs/app.log | grep "latency\|timeout"
```

### Check Database

```bash
# Connect to MySQL
mysql -u root -p antrol

# Check tables
SHOW TABLES;

# Check DoctorScheduleQuota
SELECT COUNT(*) FROM DoctorScheduleQuota;
SELECT DISTINCT poli_id FROM DoctorScheduleQuota LIMIT 5;
SELECT * FROM DoctorScheduleQuota WHERE tanggal = '2026-01-21' LIMIT 1;

# Check BpjsAntreanQueue
SELECT COUNT(*) FROM BpjsAntreanQueue;
SELECT status, COUNT(*) FROM BpjsAntreanQueue GROUP BY status;
```

### Open an Issue

If you've tried these steps and still have issues:

1. Describe problem clearly
2. Include relevant logs
3. Provide reproduction steps
4. Mention environment (OS, Node version, etc)

**GitHub Issues:** https://github.com/khoirxz/service-antran-online-bpjs/issues

---

**Last Updated:** January 21, 2026

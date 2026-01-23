# Quick Verification Checklist

## ✅ Code Changes Applied

### task.validator.ts

- [x] `validatePayload()` changed to lenient mode
- [x] `PayloadSnapshot` interface added
- [x] `debugLogPayload()` function added
- [x] TypeScript compiles without errors

### register.poller.ts

- [x] Import `debugLogPayload`
- [x] Call `debugLogPayload()` after building payload
- [x] Call `debugLogPayload()` when validation fails
- [x] TypeScript compiles without errors

---

## 🧪 Test Steps (Run These)

### Step 1: Verify Build

```bash
cd /mnt/data/Project/RS/antrol-service
npm run build
# Should complete without errors
```

### Step 2: Start Poller with Debug Output

```bash
pnpm start
# Watch for "📊 === PAYLOAD DEBUG ===" messages
# Should see payload data every ~100-200ms in register batch
```

### Step 3: Check VisitEvent Growth

In another terminal:

```bash
pnpm prisma:studio
# Go to VisitEvent table
# Watch the count - should increase as poller runs
# Before fix: count was stuck
# After fix: count should keep increasing
```

### Step 4: Check TaskValidationLog

In Prisma Studio:

- Go to TaskValidationLog table
- Should mostly be empty or have few PENDING items
- Before fix: Would have hundreds of PENDING
- After fix: Should be much cleaner

---

## 📊 Expected Behavior

### Console Output

```
📊 === PAYLOAD DEBUG (REGISTER_101_001) ===
Visit ID: 2601220001
Struktur Payload: {
  kd_dokter: '001',
  nama_dokter: 'Dr. Ahmad',
  kd_poli: '101',
  nama_poli: 'Umum',
  jam_praktek: '08:00-12:00',
  kuota_jkn: 0,        ← IMPORTANT: Kuota 0 tetap ditampilkan
  estimasi_dilayani: 1674382800,
  ...
}
=== END PAYLOAD DEBUG ===

✅ Event register 2601220001 READY_BPJS - kuota: JKN=0/20
```

### Database Growth

Before:

- VisitEvent count: ~100-200 (stuck)
- TaskValidationLog: 500+ PENDING items

After:

- VisitEvent count: keeps increasing (100-300/batch)
- TaskValidationLog: mostly clean, few items

---

## 🔍 Troubleshooting

### If data is STILL not entering VisitEvent:

1. Check debug output - is `debugLogPayload()` being called?
2. Look for error messages AFTER the debug output
3. Error is likely NOT in validatePayload - could be:
   - Database insertion error (unique constraint?)
   - Khanza query error
   - HFIS validation error

### If you see "quota calculation error":

1. This is NOT the validatePayload issue
2. Problem is in `calculateQuota()` function
3. Check Khanza database connection

### If payload shows empty values:

1. This is OK now - lenient validation accepts it
2. Fallback mechanisms will handle during BPJS send
3. Admin can see data and troubleshoot

---

## 📋 Validation Rules Changed

| Scenario            | Old       | New       |
| ------------------- | --------- | --------- |
| Kuota = 0           | ❌ REJECT | ✅ ACCEPT |
| Jadwal = ""         | ❌ REJECT | ✅ ACCEPT |
| Estimasi = 0        | ❌ REJECT | ✅ ACCEPT |
| Null payload        | ❌ REJECT | ❌ REJECT |
| Missing poli/dokter | ❌ REJECT | ❌ REJECT |

---

## ✨ You're Done!

All changes are in place. Next:

1. Test with `pnpm start`
2. Monitor database and console
3. Verify data is flowing correctly
4. If working: Great!
5. If not: Check troubleshooting above

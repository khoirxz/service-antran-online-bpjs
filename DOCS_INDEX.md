# 📖 Documentation Index

Welcome! This is your guide to the ANTREAN SERVICE codebase.

## 🎯 Start Here

**New to the project?**

1. [README.md](README.md) - Project overview
2. [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) - How the code is organized

## 📚 Main Documentation

### For Understanding the Architecture

- **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** - Directory layout, data flow, development workflow
- **[DATA_FLOW.md](DATA_FLOW.md)** - Visual diagrams of how data moves through the system

### For Understanding the Code

- **[src/domain/README.md](src/domain/README.md)** - Business logic & domain functions
- **[IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)** - Technical implementation details
- **[Quick_Reference.md](Quick_Reference.md)** - Code snippets for common operations

### For Refactoring History

- **[REFACTOR_SUMMARY.md](REFACTOR_SUMMARY.md)** - Why we refactored VisitEvent structure
- **[CLEANUP_LOG.md](CLEANUP_LOG.md)** - What we cleaned up and removed
- **[REFACTOR_COMPLETE.md](REFACTOR_COMPLETE.md)** - Summary of all refactoring work

## 🗂️ By Topic

### Understanding the Database

- [PROJECT_STRUCTURE.md - Important Files](PROJECT_STRUCTURE.md#important-files-to-know)
- Prisma schema: `prisma/schema.prisma`
- Key tables: VisitEvent, BpjsAntreanQueue, DoctorScheduleQuota

### Understanding the Pollers

- [PROJECT_STRUCTURE.md - Data Flow: REGISTER](PROJECT_STRUCTURE.md#-data-flow-register)
- [PROJECT_STRUCTURE.md - Data Flow: CHECKIN/START/FINISH](PROJECT_STRUCTURE.md#-data-flow-checkinstartfinish)
- Poller code: `src/poller/*.ts`

### Understanding the Queue System

- [PROJECT_STRUCTURE.md - Queue Processing](PROJECT_STRUCTURE.md#queue-processing)
- Queue builder: `src/queue/queue.builder.ts`
- Queue worker: `src/queue/queue.worker.ts`

### Understanding Validation

- [src/domain/README.md - Validation section](src/domain/README.md#-validation)
- HFIS validator: `src/domain/hfis.validator.ts`
- Quota calculation: `src/domain/quota.aggregator.ts`

### Understanding the API

- [PROJECT_STRUCTURE.md - API Routes](PROJECT_STRUCTURE.md#api-routes-for-adminmonitoring)
- API code: `src/api/*.ts`

### Understanding Task Progress

- [REFACTOR_SUMMARY.md - Task Progress Structure](REFACTOR_SUMMARY.md#task_progress-structure)
- [src/domain/README.md - Task Management](src/domain/README.md#-task-management)
- Helper functions: `src/domain/task.progress.ts`

## 🎓 Learning Paths

### If you want to understand...

**...the overall architecture**

1. [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
2. [DATA_FLOW.md](DATA_FLOW.md)
3. [README.md](README.md)

**...how to add a new poller**

1. [PROJECT_STRUCTURE.md - Development Workflow](PROJECT_STRUCTURE.md#development-workflow)
2. [src/domain/README.md](src/domain/README.md)
3. Example: `src/poller/register.poller.ts`

**...how to add a new API endpoint**

1. [PROJECT_STRUCTURE.md - Development Workflow](PROJECT_STRUCTURE.md#development-workflow)
2. Example: `src/api/audit.routes.ts`

**...how the REGISTER flow works**

1. [DATA_FLOW.md - Single VisitEvent](DATA_FLOW.md#single-visitevent-with-task_progress)
2. [PROJECT_STRUCTURE.md - Data Flow: REGISTER](PROJECT_STRUCTURE.md#-data-flow-register)
3. Code: `src/poller/register.poller.ts` → `src/domain/queue.payload.ts` → `src/queue/queue.worker.ts`

**...how the CHECKIN/START/FINISH flow works**

1. [DATA_FLOW.md - Example Query](DATA_FLOW.md#example-query)
2. [PROJECT_STRUCTURE.md - Data Flow: CHECKIN/START/FINISH](PROJECT_STRUCTURE.md#-data-flow-checkinstartfinish)
3. Code: `src/poller/task3.poller.ts` → `src/domain/task.progress.ts` → `src/queue/queue.worker.ts`

**...how validation works**

1. [src/domain/README.md - Validation section](src/domain/README.md#-validation)
2. [IMPLEMENTATION_GUIDE.md - Benefits section](IMPLEMENTATION_GUIDE.md#benefits-summary)
3. Code: `src/domain/hfis.validator.ts`

**...how the queue works**

1. [PROJECT_STRUCTURE.md - Queue Processing](PROJECT_STRUCTURE.md#queue-processing)
2. [DATA_FLOW.md - Queue Builder & Worker](DATA_FLOW.md#key-improvements)
3. Code: `src/queue/queue.builder.ts` and `src/queue/queue.worker.ts`

## 🔍 Finding Things

### I want to find the code for...

| Feature                | File                             |
| ---------------------- | -------------------------------- |
| REGISTER events        | `src/poller/register.poller.ts`  |
| CHECKIN events         | `src/poller/task3.poller.ts`     |
| START events           | `src/poller/task4.poller.ts`     |
| FINISH events          | `src/poller/task5.poller.ts`     |
| Building BPJS payloads | `src/domain/queue.payload.ts`    |
| Validating data        | `src/domain/hfis.validator.ts`   |
| Calculating quota      | `src/domain/quota.aggregator.ts` |
| Tracking task progress | `src/domain/task.progress.ts`    |
| Building queue jobs    | `src/queue/queue.builder.ts`     |
| Sending to BPJS        | `src/queue/queue.worker.ts`      |
| Queue monitoring API   | `src/api/audit.routes.ts`        |
| Admin endpoints        | `src/api/admin.routes.ts`        |

### I want to understand...

| Topic                  | Document                                           |
| ---------------------- | -------------------------------------------------- |
| Project structure      | [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)       |
| Data flows             | [DATA_FLOW.md](DATA_FLOW.md)                       |
| Domain layer           | [src/domain/README.md](src/domain/README.md)       |
| Implementation details | [IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md) |
| Code snippets          | [Quick_Reference.md](Quick_Reference.md)           |
| Refactoring history    | [REFACTOR_SUMMARY.md](REFACTOR_SUMMARY.md)         |
| Cleanup details        | [CLEANUP_LOG.md](CLEANUP_LOG.md)                   |

## 🚀 Quick Commands

```bash
# Build
npm run build

# Develop
npm run dev

# Test
npm test

# Check types
npx tsc --noEmit

# View database
npx prisma studio

# Migrate database
npx prisma migrate deploy
```

See [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md#common-commands) for more.

## ❓ FAQ

**Q: Where do I start if I'm new?**  
A: Read [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) first, then [DATA_FLOW.md](DATA_FLOW.md).

**Q: How do I add a new poller?**  
A: Check [PROJECT_STRUCTURE.md - Adding a New Poller](PROJECT_STRUCTURE.md#adding-a-new-poller).

**Q: What's the data flow?**  
A: See [DATA_FLOW.md](DATA_FLOW.md) for visual diagrams.

**Q: Which payload builder should I use?**  
A: Use `src/domain/queue.payload.ts` (the one in queue, not domain).

**Q: How does validation work?**  
A: See [src/domain/README.md - Validation](src/domain/README.md#-validation).

**Q: Where do I find the API endpoints?**  
A: See [PROJECT_STRUCTURE.md - API Routes](PROJECT_STRUCTURE.md#-api-routes-for-adminmonitoring).

## 📞 Need Help?

- Check the relevant documentation first (see table above)
- Look for similar code in the project
- Check error messages in logs
- See [IMPLEMENTATION_GUIDE.md - Common Issues](IMPLEMENTATION_GUIDE.md#common-issues)

## ✅ Checklist

Before contributing, make sure you understand:

- [ ] Project structure (PROJECT_STRUCTURE.md)
- [ ] Data flows (DATA_FLOW.md)
- [ ] Domain layer (src/domain/README.md)
- [ ] Database schema (prisma/schema.prisma)
- [ ] Coding conventions (look at existing code)

## 📝 Version History

- **2026-01-20** - Cleanup & refactoring complete
  - Removed duplicate files
  - Added comprehensive documentation
  - Ready for open-source release

---

**Last Updated:** 2026-01-20  
**Status:** ✅ Production Ready

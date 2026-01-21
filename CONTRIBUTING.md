# Contributing Guide

Terima kasih sudah tertarik berkontribusi pada ANTREAN ONLINE (BPJS SERVICE)! Panduan ini menjelaskan cara berkontribusi pada project open-source kami.

## 📋 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [How to Contribute](#how-to-contribute)
5. [Pull Request Process](#pull-request-process)
6. [Coding Standards](#coding-standards)
7. [Testing](#testing)
8. [Documentation](#documentation)

---

## Code of Conduct

Kami berkomitmen untuk menyediakan lingkungan yang welcoming dan inklusif. Semua kontributor harus:

- Menghormati perbedaan pendapat dan pengalaman
- Memberikan dan menerima kritik konstruktif dengan baik
- Fokus pada apa yang terbaik untuk komunitas
- Menunjukkan empati terhadap kontributor lain

Pelanggaran CoC dapat dilaporkan ke maintainer.

---

## Getting Started

### Prerequisites

- **Node.js** 18+ dan **pnpm** (package manager)
- **Git** untuk version control
- **Docker** & **Docker Compose** (untuk development)
- Pemahaman dasar tentang:
  - TypeScript
  - Express.js
  - Prisma ORM
  - BPJS API (opsional)

### Fork & Clone

```bash
# 1. Fork repository di GitHub
#    https://github.com/khoirxz/service-antran-online-bpjs

# 2. Clone fork Anda
git clone https://github.com/{YOUR_USERNAME}/service-antran-online-bpjs.git
cd antrol-service

# 3. Add upstream untuk sync
git remote add upstream https://github.com/khoirxz/service-antran-online-bpjs.git
```

---

## Development Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Setup Database

```bash
# Start MySQL dengan Docker Compose
docker-compose up -d

# Run Prisma migrations
pnpm exec prisma migrate dev

# (Optional) Seed database
pnpm exec prisma db seed
```

### 3. Environment Variables

Create `.env.local`:

```env
# Database
DATABASE_URL="mysql://root:password@localhost:3306/antrol"

# BPJS API
BPJS_KONSID="your-bpjs-konsid"
BPJS_SECRET="your-bpjs-secret"

# Khanza
KHANZA_HOST="localhost"
KHANZA_USER="khanza_user"
KHANZA_PASS="khanza_pass"
KHANZA_DB="khanza"

# Application
PORT=3000
NODE_ENV="development"
```

### 4. Start Development Server

```bash
# Build TypeScript
pnpm run build

# Start server
pnpm run start

# Or with watch mode (requires npm-run-all or similar)
pnpm run dev
```

Check: `http://localhost:3000/health`

---

## How to Contribute

### 1. Choose an Issue

Cari issue yang ingin Anda kerjakan:

- 🆕 **Good First Issue** - Perfect untuk contributor baru
- 🎯 **Help Wanted** - Need additional support
- 🐛 **Bug** - Issue yang perlu diperbaiki
- ✨ **Feature** - Feature baru yang diusulkan

```bash
# Lihat all issues
# https://github.com/khoirxz/service-antran-online-bpjs/issues
```

### 2. Create Feature Branch

```bash
# Sync dengan upstream
git fetch upstream
git rebase upstream/main

# Create feature branch
git checkout -b fix/issue-123-short-description
# atau
git checkout -b feat/add-new-feature-name
```

**Branch naming convention:**

- `fix/` - Bug fixes
- `feat/` - New features
- `docs/` - Documentation
- `refactor/` - Code refactoring
- `test/` - Test improvements
- `perf/` - Performance improvements

### 3. Make Changes

Edit files dan test locally:

```bash
# Build & check TypeScript errors
pnpm run build

# Run tests
pnpm test

# Lint code
pnpm run lint
```

### 4. Commit Changes

```bash
# Stage changes
git add .

# Commit dengan deskriptif message
git commit -m "fix: deduplication cache not expiring after TTL

- Add TTL check in getRefreshLock()
- Cache entries now expire after 5 min
- Fixes issue #123"
```

**Commit message convention:**

```
<type>(<scope>): <subject>

<body>

<footer>
```

- **type**: feat, fix, docs, test, refactor, perf, style, chore
- **scope**: area affected (quota, scheduler, cache, etc)
- **subject**: concise description (imperative mood, lowercase)
- **body**: detailed explanation of changes
- **footer**: references to issues (Fixes #123)

### 5. Push & Create Pull Request

```bash
# Push to your fork
git push origin fix/issue-123-short-description

# Create PR on GitHub
# https://github.com/khoirxz/service-antran-online-bpjs/compare
```

---

## Pull Request Process

### PR Template

Gunakan PR template (auto-filled):

```markdown
## Description

Deskripsi singkat tentang perubahan

## Motivation & Context

Mengapa perubahan ini diperlukan?

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing

Bagaimana Anda test perubahan ini?

- [ ] Unit tests
- [ ] Integration tests
- [ ] Manual testing

## Checklist

- [ ] Code follows style guide
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] No breaking changes
- [ ] TypeScript 0 errors
```

### Review Process

1. **Maintainer Review** (1-3 hari)
   - Code quality check
   - Feature completeness
   - Documentation

2. **Request Changes or Approve**
   - Jika changes requested: update PR
   - Jika approved: siap untuk merge

3. **Merge**
   - Rebase & merge untuk clean history
   - Auto-delete feature branch

---

## Coding Standards

### TypeScript

```typescript
// ✅ Good
async function calculateQuota(
  poliId: string,
  dokterId: string,
  tanggal: string,
): Promise<QuotaInfo | null> {
  // Implementation with clear types
}

// ❌ Bad
async function calc(a: any, b: any, c: any) {
  // No types, unclear names
}
```

**Rules:**

- ✅ Use explicit types (no `any`)
- ✅ Document complex functions with JSDoc
- ✅ Use descriptive variable names
- ✅ Keep functions focused and small
- ✅ Handle errors properly (try-catch or return null)

### Code Style

```typescript
// Use 2 spaces for indentation
// Max line length: 100 characters
// Use single quotes for strings
// Use const by default, let if needed

// Export with explicit types
export async function fetchData(): Promise<Data[]> {
  // ...
}

// Document public functions
/**
 * Calculate quota for doctor
 * @param poliId - Poli ID
 * @returns QuotaInfo or null if not found
 */
export async function calculateQuota(...): Promise<QuotaInfo | null> {
  // ...
}
```

### File Organization

```
src/
├── domain/          # Business logic & domain models
│   ├── quota.aggregator.ts
│   └── schedule.cache.ts
├── poller/          # Data sync from Khanza
├── queue/           # Queue management
├── scheduler/       # Cron jobs
├── api/             # Express routes
└── lib/             # Utilities & shared code
```

---

## Testing

### Unit Tests

Test individual functions dengan jest:

```typescript
// schedule.cache.test.ts
describe("Schedule Cache", () => {
  beforeEach(() => {
    clearRefreshCache();
  });

  test("setRefreshLock marks as refreshing", () => {
    setRefreshLock("001", "2026-01-21");
    const lock = getRefreshLock("001", "2026-01-21");
    expect(lock?.refreshing).toBe(true);
  });

  test("TTL expires after 5 minutes", async () => {
    jest.useFakeTimers();
    setRefreshLock("001", "2026-01-21");

    jest.advanceTimersByTime(5 * 60 * 1000 + 1);

    const lock = getRefreshLock("001", "2026-01-21");
    expect(lock).toBeUndefined();
  });
});
```

### Integration Tests

Test feature interactions:

```typescript
// quota.aggregator.test.ts
describe("Quota Aggregator", () => {
  test("calculateQuota returns null when schedule missing", async () => {
    const quota = await calculateQuota("999", "DOK999", "2099-01-01");
    expect(quota).toBeNull();
  });

  test("deduplication coalesces concurrent requests", async () => {
    const promises = Array(10)
      .fill(null)
      .map(() => calculateQuota("001", "DOK001", "2026-01-21"));

    const results = await Promise.all(promises);
    // All should get same data
    expect(results.every((r) => r?.poli_id === "001")).toBe(true);
  });
});
```

### Run Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test -- schedule.cache.test.ts

# Watch mode
pnpm test -- --watch

# Coverage report
pnpm test -- --coverage
```

---

## Documentation

### Update Documentation

Setiap perubahan code harus update documentation:

- **JSDoc comments** untuk functions publik
- **README/docs** untuk fitur baru
- **API_REFERENCE.md** untuk API changes
- **CHANGELOG** untuk significant changes

### Example: Document a Function

```typescript
/**
 * Calculate real-time quota for doctor schedule
 *
 * Behavior:
 * - Check schedule in DB
 * - If missing: trigger async refresh, use fallback
 * - If circuit open: use last-known schedule
 * - If no fallback: return null
 *
 * Performance: < 50ms (normal), < 100ms (dedup wait)
 *
 * @param poliId - ID poli (e.g., "001")
 * @param dokterId - ID dokter (e.g., "DOK001")
 * @param tanggal - Date in YYYY-MM-DD format
 * @returns QuotaInfo with real-time data or null
 *
 * @example
 * const quota = await calculateQuota("001", "DOK001", "2026-01-21");
 * if (quota) {
 *   console.log(`Sisa kuota: ${quota.sisa_kuota_jkn}`);
 * }
 */
export async function calculateQuota(
  poliId: string,
  dokterId: string,
  tanggal: string,
): Promise<QuotaInfo | null> {
  // Implementation...
}
```

### Create Documentation File

```bash
# Create new doc file
touch docs/FEATURE_NAME.md

# Update README.md to link it
# Update table of contents in existing docs
```

---

## Common Contribution Patterns

### Bug Fix

```bash
# 1. Create issue branch
git checkout -b fix/issue-123-description

# 2. Reproduce bug locally
# 3. Add test that fails (proves bug)
# 4. Fix the bug
# 5. Test passes now
# 6. Commit & push
# 7. Create PR linking issue

# In PR description:
# Fixes #123
```

### Feature Implementation

```bash
# 1. Create feature branch
git checkout -b feat/new-feature-name

# 2. Implement feature with tests
# 3. Update documentation
# 4. Build & test locally
# 5. Commit with clear message
# 6. Create PR with detailed description

# In commit message:
# feat(scope): add new feature description
#
# - Details about implementation
# - Trade-offs or design decisions
# - Relates to #456
```

### Documentation Update

```bash
# 1. Create doc branch
git checkout -b docs/update-something

# 2. Update markdown files
# 3. Fix typos, improve clarity
# 4. Build docs locally if applicable
# 5. Commit & create PR

# In commit message:
# docs: improve documentation for X feature
#
# - Added code examples
# - Clarified performance characteristics
# - Added troubleshooting section
```

---

## Getting Help

### Questions?

- **Discussion**: https://github.com/khoirxz/service-antran-online-bpjs/discussions
- **Issues**: https://github.com/khoirxz/service-antran-online-bpjs/issues
- **Email**: Contact maintainer

### Resources

- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Express.js Guide](https://expressjs.com/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Jest Testing](https://jestjs.io/docs/getting-started)

---

## Contributor Recognition

Kami menghargai setiap kontribusi! Contributors akan:

- Dicatat di [CONTRIBUTORS.md](CONTRIBUTORS.md)
- Credited di commit history
- Mentioned di release notes

---

## License

Dengan berkontribusi pada project ini, Anda setuju bahwa kontribusi Anda akan dilisensikan di bawah lisensi yang sama dengan project ini.

---

**Happy Contributing! 🚀**

Jika ada pertanyaan, jangan ragu untuk membuka discussion atau issue.

---

**Last Updated:** January 21, 2026
**Maintained by:** [khoirxz](https://github.com/khoirxz)

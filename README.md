# ANTREAN ONLINE (BPJS SERVICE)

ANTREAN ONLINE (BPJS SERVICE)
Service ini dibuat untuk memudahkan pengiriman antrean online ke BPJS. Terutama yang masih mendapatkan kendala pada pengiriman antrean melalui SIMRS Khanza.

## � Getting Started

### Quick Start (5 minutes)

```bash
# 1. Clone repository
git clone https://github.com/khoirxz/service-antran-online-bpjs.git
cd antrol-service

# 2. Install dependencies
pnpm install

# 3. Setup database & environment
docker-compose up -d
pnpm exec prisma migrate dev

# 4. Start server
pnpm run build
pnpm run start

# 5. Verify
curl http://localhost:3000/health
```

For detailed setup, see **[CONTRIBUTING.md](CONTRIBUTING.md#development-setup)**

---

## �📚 Documentation

**Start here:**

- **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)** - Directory layout & architecture overview
- **[src/domain/README.md](src/domain/README.md)** - Business logic & domain functions

**Feature Documentation:**

- **[docs/SCHEDULE_OPTIMIZATION.md](docs/SCHEDULE_OPTIMIZATION.md)** - ⭐ **NEW**: Schedule refresh with deduplication, async refresh, circuit breaker (Performance: 99x API call reduction, 300x latency improvement)
- **[docs/API_REFERENCE.md](docs/API_REFERENCE.md)** - Complete API documentation with code examples

**Implementation Guides:**

- **[IMPLEMENTATION_GUIDE.md](IMPLEMENTATION_GUIDE.md)** - Refactored VisitEvent structure
- **[DATA_FLOW.md](DATA_FLOW.md)** - Visual data flow diagrams
- **[REFACTOR_SUMMARY.md](REFACTOR_SUMMARY.md)** - Technical refactoring details
- **[Quick_Reference.md](Quick_Reference.md)** - Code snippets & quick lookup

**Contributing & Support:**

- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Contribution guidelines, code style, testing
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues & solutions

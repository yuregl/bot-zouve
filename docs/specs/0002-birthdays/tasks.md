# Birthdays — Tasks

Implements [plan.md](./plan.md).

- [x] **T1 — Dates (FR-004):** `parseBirthdayDate` and `formatBirthdayDate` with tests for valid dates, impossible dates, leap years, and years out of range.
- [x] **T2 — Permissions (FR-003):** `parseRoleList` and `canManageBirthdays`, matching role names without regard to case and role IDs, with tests.
- [x] **T3 — Storage (FR-002, FR-005):** Mongoose model with a unique `{ guildId, userId }` index and a repository that upserts and reports whether the birthday existed, tested with a fake model.
- [x] **T4 — Connection (FR-007, NFR-001):** connect to `MONGODB_URI` at startup, log failures without the connection string, and keep the bot running.
- [x] **T5 — Command (FR-001–FR-007):** `/birthday set`, registered with the other commands and listed in `/help`, with tests for each acceptance criterion.
- [x] **T6 — Containers (NFR-002):** `Dockerfile`, `.dockerignore`, and `compose.yaml`.
- [x] **T7 — Documentation:** `.env.example`, README, and `AGENTS.md` code structure.
- [x] **T8 — Run in Docker (AC-007):** built and started with Docker Compose on 2026-10-07, set a birthday from Discord, restarted both containers, and the birthday was kept. AC-006 (database stopped) is covered by unit tests.

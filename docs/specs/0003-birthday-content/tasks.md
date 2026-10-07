# Birthday content — Tasks

Implements [plan.md](./plan.md).

- [x] **T1 — Domain (FR-001, FR-003):** content types, `parseBirthdayMessage`, `describeContent`, and the repository interface, with tests.
- [x] **T2 — Storage (FR-002, FR-007):** Mongoose model with indexes by server and date and a unique video per server, and a repository that adds, lists, and removes, tested with a fake store.
- [x] **T3 — Commands (FR-001–FR-006, FR-008):** `/birthday message add`, `/birthday video add`, `/birthday content list`, and `/birthday content remove`, sharing the role check of `/birthday set`, with tests for each acceptance criterion.
- [x] **T4 — Documentation:** `/help` and README.
- [ ] **T5 — Run in Docker:** add a message and a video, list, and remove from a test server.

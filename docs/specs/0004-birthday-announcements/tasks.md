# Birthday announcements — Tasks

Implements [plan.md](./plan.md).

- [x] **T1 — Time (FR-001, NFR-001):** `readAnnounceTime`, `clockIn`, and `isoDay`, with tests.
- [x] **T2 — Video check (FR-004, NFR-002):** `checkYouTubeVideo` with oEmbed, tested with a fake `fetch` and checked against YouTube on 2026-10-07.
- [x] **T3 — Message and video choice (FR-003, FR-004, FR-006):** `buildAnnouncement` and `pickWorkingVideo`, with tests.
- [x] **T4 — Storage (FR-004, FR-005, FR-007):** announcement claims on birthdays, video availability on content, and ⚠️ in `/birthday content list`, with tests.
- [x] **T5 — Announcer (FR-001–FR-005):** runs every 5 minutes after the announce time and is started when the bot is ready, tested with a fake clock and channel.
- [x] **T6 — Documentation:** `.env.example` and README.
- [ ] **T7 — Run in Docker:** set a birthday for today and `BIRTHDAY_ANNOUNCE_TIME` a few minutes ahead, and check the message in `#zouve-music`.

# Birthdays — Plan

Implements [spec.md](./spec.md).

## Architecture

- `src/birthdays/birthday.ts`: the `Birthday` type, `parseBirthdayDate` (FR-004), `formatBirthdayDate`, and the `BirthdayRepository` interface the command depends on.
- `src/birthdays/permissions.ts`: `parseRoleList` reads `BIRTHDAY_MANAGER_ROLES`; `canManageBirthdays` checks the member's roles by name or ID (FR-003).
- `src/infra/db/mongo.ts`: connects Mongoose to `MONGODB_URI` at startup. A missing variable or a failed connection is logged without stopping the bot (FR-007). After connecting, it creates the indexes of every model; Mongoose's automatic index creation is off because, with operations not queued while disconnected, it failed silently for models registered before the connection (found on 2026-10-07, when a duplicate video was accepted).
- `src/infra/db/models/birthday-model.ts`: the Mongoose schema and model.
- `src/repositories/birthday-repository.ts`: the `BirthdayRepository` that turns a birthday into the stored form, saves it with an upsert, and reports whether it already existed (FR-002, FR-005).
- `src/commands/birthday.ts`: `/birthday set`. Like `/play`, it takes its dependencies as parameters with defaults, so tests pass fakes.
- `src/index.ts`: connects to MongoDB before logging in to Discord.

## Data

Collection `birthdays`:

| Field | Type | Notes |
|---|---|---|
| `guildId` | string | Discord server ID |
| `userId` | string | Member's user ID |
| `username` | string | Discord username, refreshed on each save |
| `birthDate` | date, optional | Only with a year; midnight UTC so the day does not shift with time zones |
| `day`, `month` | number, optional | Only without a year; 1–31, 1–12 |
| `setBy` | string | User ID of who ran the command |
| `createdAt`, `updatedAt` | date | Mongoose timestamps |

A unique index on `{ guildId, userId }` keeps one birthday per member and server. Discord IDs are strings because they do not fit in a JavaScript number.

## Configuration

- `MONGODB_URI`: connection string, for example `mongodb://bot:secret@localhost:27017/zouve?authSource=admin`. Docker Compose sets it to the `mongo` service.
- `MONGO_USERNAME`, `MONGO_PASSWORD`: MongoDB root user that Docker Compose creates on the first start.
- `BIRTHDAY_MANAGER_ROLES`: comma-separated role names or IDs.

## Containers

- `Dockerfile`: two stages on `node:22-bookworm-slim`. The build stage installs all dependencies and compiles TypeScript; the runtime stage installs production dependencies only, plus Python 3, which the Linux `yt-dlp` that `youtube-dl-exec` downloads needs. It runs as the `node` user with `node dist/index.js`, since the container gets its variables from Compose instead of an `.env` file.
- `.dockerignore`: leaves out `node_modules` (it holds Windows binaries such as `yt-dlp.exe`), `dist`, `.env`, logs, and Git files, so secrets do not end up in the image.
- `compose.yaml`: `bot` (built from the `Dockerfile`, variables from `.env`, restarts unless stopped) and `mongo` (`mongo:8`, a named volume for its data, a health check the bot waits for, and port 27017 published on `127.0.0.1` only, so `npm run dev` on the host can use it).

## Risks

- `yt-dlp` and Discord voice libraries download platform binaries on install; installing inside the image avoids mixing Windows and Linux files.
- A MongoDB without credentials would accept anyone who reaches the port; Compose requires a user and password and publishes the port on localhost only.

## Validation

- Unit tests for date parsing, role checks, the repository (with a fake model), the connection, and the command (with a fake repository).
- `npm run check`, `npm run lint`, `npm run test:coverage`, and `npm run build`.
- `docker compose up -d --build`, then `/birthday set` in a test server, `docker compose restart`, and a check that the data is still there (AC-007).

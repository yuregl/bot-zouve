# Birthday content — Plan

Implements [spec.md](./spec.md).

## Architecture

- `src/birthdays/birthday-content.ts`: the `BirthdayContent` types, `parseBirthdayMessage` (FR-001), `describeContent` for lists and replies, and the `BirthdayContentRepository` interface.
- `src/infra/db/models/birthday-content-model.ts`: the Mongoose schema, with a unique index on `{ guildId, videoId }` for videos.
- `src/repositories/birthday-content-repository.ts`: adds, lists (oldest first), and removes items; reports a duplicate video (MongoDB error 11000) instead of throwing. It uses a small store around the Mongoose model, so tests replace the database.
- `src/commands/birthday.ts`: routes `/birthday` subcommands after checking the server and the role once for all of them; each handler checks the database.
- `src/commands/birthday-content.ts`: the handlers for `message add`, `video add` (checking the link with `getYouTubeVideoId` from `src/infra/youtube.ts`, so the domain does not depend on infrastructure), `list`, and `remove`.

## Data

Collection `birthdaycontents`:

| Field | Type | Notes |
|---|---|---|
| `guildId` | string | Discord server ID |
| `type` | `"message"` or `"video"` | |
| `text` | string, messages only | 1–500 characters |
| `videoId`, `videoUrl` | string, videos only | 11-character YouTube ID and `https://www.youtube.com/watch?v=<id>` |
| `addedBy` | string | User ID of who added it |
| `createdAt`, `updatedAt` | date | Mongoose timestamps |

The unique index on `{ guildId, videoId }` applies only to documents that have a `videoId`, so messages are not affected.

## Numbering

`/birthday content list` numbers items by `createdAt`. `/birthday content remove` reads the list again and removes the item at that position by its `_id`, like `/remove` uses the numbers shown by `/queue`.

## Validation

- Unit tests for parsing, the repository (with a fake model), and each command, with fakes for the repositories.
- `npm run check`, `npm run lint`, `npm run test:coverage`, `npm run build`.
- In Docker: add a message and a video, list, and remove from a test server.

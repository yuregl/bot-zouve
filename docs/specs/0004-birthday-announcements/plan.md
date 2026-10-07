# Birthday announcements — Plan

Implements [spec.md](./spec.md).

## Architecture

- `src/infra/config.ts`: `readAnnounceTime` reads `BIRTHDAY_ANNOUNCE_TIME` (`HH:MM`, default `09:00`).
- `src/birthdays/birthday.ts`: `clockIn` gives the date and time in a time zone; `isoDay` writes a calendar day as `YYYY-MM-DD`.
- `src/infra/youtube.ts`: `checkYouTubeVideo` asks `https://www.youtube.com/oembed?url=<video>&format=json`: 200 is available; 400, 401, 403, and 404 are unavailable; anything else, a timeout, or a network error is unknown.
- `src/birthdays/announcement.ts`: builds the message (FR-003, FR-006) and picks a working video, checking candidates in random order and recording their availability (FR-004).
- `src/birthdays/birthday-announcer.ts`: every 5 minutes, once the time is reached, finds each server's birthdays for the day, claims each one, and sends it to `#zouve-music`. Discord, the repositories, the video check, the clock, and randomness are injected.
- Repositories: `BirthdayRepository.claimAnnouncement` and `releaseAnnouncement`; `BirthdayContentRepository.setVideoAvailability`.
- `src/index.ts`: starts the announcer when the bot is ready.

## Once a year (FR-005)

Each birthday document gets `lastAnnouncedOn` (`YYYY-MM-DD` in São Paulo). Claiming is one atomic update that only matches when `lastAnnouncedOn` is not today, so two runs, or two bot instances, cannot both claim it. When sending fails, the claim is released by restoring the previous value, and the next run tries again.

## Data

- `birthdays.lastAnnouncedOn`: string, optional.
- `birthdaycontents.unavailable`: boolean, `true` while a video is known not to work; `checkedAt`: date of the last check.

## Message

```
🎉🎂 Happy birthday, @member! 🥳🎈

<message from the collection, or the default>

<video link>
```

Discord shows the video's player under the message. `allowedMentions` only allows the birthday member, so text from the collection cannot notify others.

## Validation

- Unit tests for the time parsing, `clockIn`, the oEmbed check (with a fake `fetch`), the message, the video choice, the repositories (with fake stores), and the announcer (with a fake client and clock).
- `npm run check`, `npm run lint`, `npm run test:coverage`, `npm run build`.
- In Docker: set a birthday for today, set `BIRTHDAY_ANNOUNCE_TIME` to a few minutes ahead, and check the message in `#zouve-music`, including a video that no longer exists.

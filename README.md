# bot-zouve

A music bot for Discord. The project follows specification-driven development (SDD): requirements and decisions are recorded before implementation.

## Project documentation

- [AGENTS.md](./AGENTS.md): canonical instructions for development agents.
- [CLAUDE.md](./CLAUDE.md): Claude Code entry point; supplements `AGENTS.md`.
- [SDD guide](./docs/SDD.md): workflow, structure, and specification criteria.
- [Initial specification](./docs/specs/0001-discord-music-bot/spec.md): proposed scope and outstanding decisions.
- [Birthdays](./docs/specs/0002-birthdays/spec.md): `/birthday set`, MongoDB, and Docker.
- [Birthday content](./docs/specs/0003-birthday-content/spec.md): the server's collection of birthday messages and videos.
- [Birthday announcements](./docs/specs/0004-birthday-announcements/spec.md): congratulating members on their birthday.

## Status

TypeScript, `discord.js`, and `@discordjs/voice` have been selected. `/help`, `/setup`, `/play` (alias `/p`, song names searched on YouTube, YouTube video links, or Spotify track links played from YouTube, via `yt-dlp`), `/pause`, `/resume`, `/seek`, `/skip`, `/stop`, `/leave`, `/queue`, `/remove`, and `/birthday set` are available. The bot and MongoDB run with Docker Compose; where they are hosted remains undecided.

## Development

- Requires Node.js 22.12 or later.
- Copy `.env.example` to `.env` and set `DISCORD_TOKEN` to the bot token created in the [Discord Developer Portal](https://discord.com/developers/applications).
- `npm install`: install dependencies.
- `npm run dev`: start in development mode.
- `npm run build`: compile TypeScript to `dist/`.
- `npm run lint`: lint the code with Oxlint (`.oxlintrc.json`).
- `npm test`: run the unit tests.
- `npm run test:coverage`: run the unit tests with a coverage report; fails if line, branch, or function coverage is below 90%.
- `npm start`: start the compiled version using variables from `.env`.

Never share or commit the `.env` file.

The global `/help`, `/setup`, `/play`, `/p`, `/pause`, `/resume`, `/seek`, `/skip`, `/stop`, `/leave`, `/queue`, `/remove`, and `/birthday` commands are registered when the bot starts. They may take a few minutes to become available in Discord.

After inviting the bot, an admin runs `/setup` to create the `#zouve-music` channel; music commands only work there. Renaming that channel breaks the link, since the bot finds it by name.

## Docker

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/) (WSL 2 backend on Windows). `compose.yaml` runs two containers: the bot, built from the `Dockerfile`, and MongoDB, whose data is kept in the `mongo-data` volume.

1. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`, `MONGO_USERNAME`, `MONGO_PASSWORD`, and `BIRTHDAY_MANAGER_ROLES`. Use a password with letters and numbers only, since it goes into a connection string.
2. `docker compose up -d --build`: build the bot and start both containers in the background.
3. `docker compose logs -f bot`: follow the bot's logs.
4. `docker compose down`: stop the containers; the data stays in the volume (`docker compose down -v` deletes it).

MongoDB creates the user from `MONGO_USERNAME` and `MONGO_PASSWORD` only on the first start, when the volume is empty. Its port is published on `127.0.0.1:27017`, so `npm run dev` on the same computer can use it through `MONGODB_URI`. Do not run the bot in Docker and with `npm run dev` at the same time with the same token: both would answer every command.

## Birthdays

`/birthday set user:@member date:15/03` (or `15/03/1998`; the year is optional) saves a member's birthday in MongoDB. Only members with a role listed in `BIRTHDAY_MANAGER_ROLES` can use it: a comma-separated list of role names (any case) or role IDs, such as `admin,Moderador`. Without `MONGODB_URI`, or while the database is down, the command says birthdays cannot be saved and the music commands keep working.

Members with those roles also manage a collection of birthday messages and YouTube videos for the server, for the bot to use on members' birthdays:

- `/birthday message add text:<message>`: adds a message (up to 500 characters), like `С днём рождения! 🎉`.
- `/birthday video add link:<YouTube link>`: adds a video; the same video cannot be added twice.
- `/birthday content list`: shows the collection, numbered; only the member who asks sees it, so it stays a surprise.
- `/birthday content remove number:<n>`: removes the item with that number in `/birthday content list`.

Any member can run `/birthday list` to see the server's birthdays, the next ones first, with day and month only (never the year).

Every day at `BIRTHDAY_ANNOUNCE_TIME` (default `09:00`, São Paulo time), the bot congratulates each member whose birthday it is in `#zouve-music`: one message per member, mentioning them, with a message and a video drawn from the collection. Before sending a video, it checks with YouTube's oEmbed service that the video still works; a deleted, private, or not embeddable video is marked ⚠️ unavailable in `/birthday content list`, and another one is drawn. If the bot is offline at that time, it congratulates when it comes back the same day, and never twice.

## Git hooks

`npm install` installs Git hooks with [Lefthook](https://lefthook.dev) (`lefthook.yml`): before each push, the type check, lint, and tests with the 90% coverage minimum run in parallel and block the push if any fails; each commit message is checked with commitlint. CI runs the same checks, so skipping a hook with `--no-verify` does not skip them.

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `main`: type check, lint, build, tests on Node.js 22 and 24, coverage (at least 90% of lines, branches, and functions), commit message linting (Conventional Commits, `commitlint.config.mjs`), and secret scanning with Gitleaks.

## Timeouts

Optional variables in `.env`, in seconds; when unset, the defaults apply. The bot refuses to start when one is not a whole number above zero.

- `IDLE_TIMEOUT_SECONDS` (default 300): time with nothing playing or queued before the bot leaves the voice channel.
- `ALONE_TIMEOUT_SECONDS` (default 180): time with no one but bots in the voice channel before the bot leaves it.
- `SKIP_VOTE_TIMEOUT_SECONDS` (default 60): how long a vote to skip stays open.

## YouTube cookies

YouTube sometimes refuses the bot with "Sign in to confirm you're not a bot", mostly on server IPs; every `/play` then fails, Spotify links included, since their audio also comes from YouTube. To get past it, give `yt-dlp` the cookies of a YouTube session:

1. Sign in to YouTube with a throwaway Google account (YouTube may restrict the account, and the cookies give access to it).
2. Export the YouTube cookies in Netscape format, as described in the [yt-dlp wiki](https://github.com/yt-dlp/yt-dlp/wiki/Extractors#exporting-youtube-cookies), and save them as `cookies/youtube.txt` in the project folder (ignored by Git and Docker).
3. Set `YOUTUBE_COOKIES_FILE=cookies/youtube.txt` in `.env` and restart the bot (`docker compose up -d`).

Docker Compose mounts the `cookies/` folder read-only in the container, so the same path works with Docker and with `npm run dev`. The bot logs "YouTube cookies loaded" at startup and refuses to start when the file cannot be read. Cookies expire: when the error comes back, export them again and restart the bot.

## Logs

The bot logs to the terminal and appends to `logs/bot.log` (ignored by Git). Each line has a UTC timestamp, level, module, message, and JSON context; errors include the stack trace, the underlying cause, and `yt-dlp` error output.

- `LOG_LEVEL=debug` in `.env` also logs voice connection and audio player state changes, which helps diagnose playback that never starts.
- `LOG_FILE` changes the file path; set it empty to log to the terminal only.

Logged context includes server, channel, and user names and the `/play` query. Tokens are never logged.

## Next step

Review and approve the initial specification, then resolve its outstanding decisions before creating the technical plan and starting implementation.

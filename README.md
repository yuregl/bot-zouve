# bot-zouve

A music bot for Discord. The project follows specification-driven development (SDD): requirements and decisions are recorded before implementation.

## Project documentation

- [AGENTS.md](./AGENTS.md): canonical instructions for development agents.
- [CLAUDE.md](./CLAUDE.md): Claude Code entry point; supplements `AGENTS.md`.
- [SDD guide](./docs/SDD.md): workflow, structure, and specification criteria.
- [Initial specification](./docs/specs/0001-discord-music-bot/spec.md): proposed scope and outstanding decisions.

## Status

TypeScript, `discord.js`, and `@discordjs/voice` have been selected. `/help`, `/setup`, `/play` (alias `/p`, song names searched on YouTube, YouTube video links, or Spotify track links played from YouTube, via `yt-dlp`), `/pause`, `/resume`, `/seek`, `/skip`, `/stop`, `/leave`, `/queue`, and `/remove` are available. The deployment approach remains undecided.

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

The global `/help`, `/setup`, `/play`, `/p`, `/pause`, `/resume`, `/seek`, `/skip`, `/stop`, `/leave`, `/queue`, and `/remove` commands are registered when the bot starts. They may take a few minutes to become available in Discord.

After inviting the bot, an admin runs `/setup` to create the `#zouve-music` channel; music commands only work there. Renaming that channel breaks the link, since the bot finds it by name.

## Git hooks

`npm install` installs Git hooks with [Lefthook](https://lefthook.dev) (`lefthook.yml`): before each push, the type check, lint, and tests with the 90% coverage minimum run in parallel and block the push if any fails; each commit message is checked with commitlint. CI runs the same checks, so skipping a hook with `--no-verify` does not skip them.

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and on pushes to `main`: type check, lint, build, tests on Node.js 22 and 24, coverage (at least 90% of lines, branches, and functions), commit message linting (Conventional Commits, `commitlint.config.mjs`), and secret scanning with Gitleaks.

## Logs

The bot logs to the terminal and appends to `logs/bot.log` (ignored by Git). Each line has a UTC timestamp, level, module, message, and JSON context; errors include the stack trace, the underlying cause, and `yt-dlp` error output.

- `LOG_LEVEL=debug` in `.env` also logs voice connection and audio player state changes, which helps diagnose playback that never starts.
- `LOG_FILE` changes the file path; set it empty to log to the terminal only.

Logged context includes server, channel, and user names and the `/play` query. Tokens are never logged.

## Next step

Review and approve the initial specification, then resolve its outstanding decisions before creating the technical plan and starting implementation.

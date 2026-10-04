# bot-zouve

A music bot for Discord. The project follows specification-driven development (SDD): requirements and decisions are recorded before implementation.

## Project documentation

- [AGENTS.md](./AGENTS.md): canonical instructions for development agents.
- [CLAUDE.md](./CLAUDE.md): Claude Code entry point; supplements `AGENTS.md`.
- [SDD guide](./docs/SDD.md): workflow, structure, and specification criteria.
- [Initial specification](./docs/specs/0001-discord-music-bot/spec.md): proposed scope and outstanding decisions.

## Status

TypeScript and `discord.js` have been selected. The `/help` command is available; music playback commands are still in development. The audio provider and deployment approach remain undecided.

## Development

- Requires Node.js 22.12 or later.
- Copy `.env.example` to `.env` and set `DISCORD_TOKEN` to the bot token created in the [Discord Developer Portal](https://discord.com/developers/applications).
- `npm install`: install dependencies.
- `npm run dev`: start in development mode.
- `npm run build`: compile TypeScript to `dist/`.
- `npm start`: start the compiled version using variables from `.env`.

Never share or commit the `.env` file.

The global `/help` command is registered when the bot starts. It may take a few minutes for the command to become available in Discord.

## Logs

The bot logs to the terminal and appends to `logs/bot.log` (ignored by Git). Each line has a UTC timestamp, level, module, message, and JSON context; errors include the stack trace, the underlying cause, and `yt-dlp` error output.

- `LOG_LEVEL=debug` in `.env` also logs voice connection and audio player state changes, which helps diagnose playback that never starts.
- `LOG_FILE` changes the file path; set it empty to log to the terminal only.

Logged context includes server, channel, and user names and the `/play` query. Tokens are never logged.

## Next step

Review and approve the initial specification, then resolve its outstanding decisions before creating the technical plan and starting implementation.

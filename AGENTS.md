# Agent Instructions

## Source of truth

- Read this file and the relevant specification in `docs/specs/` before proposing or changing behavior.
- `AGENTS.md` is the canonical source for shared instructions. Tool-specific instruction files should point here instead of duplicating rules.
- Follow `docs/SDD.md`. If a request changes behavior without an approved specification, update the specification and ask for confirmation when the change depends on a product decision.
- Do not treat decisions marked as pending as approved requirements.

## Project rules

- The bot's user interface is in Portuguese; keep slash command names clear and consistent.
- Do not choose a language, library, audio provider, storage solution, or hosting platform without recording the decision in an approved specification.
- Never expose tokens, secrets, or private data. Use environment variables and keep example values free of real credentials.
- Validate user, bot, and voice-channel permissions before starting or controlling playback.
- Report errors clearly; do not ignore failures or report success when an operation fails.
- Preserve the approved scope. For behavior changes, update requirements and acceptance criteria before or alongside implementation.
- Prefer small, type-safe changes that follow existing patterns. Do not add dependencies without a justified need.

## Code structure

- `src/commands/`: slash commands; validate the request and reply to the user.
- `src/music/`: music behavior, such as tracks, the queue, and playback sessions.
- `src/birthdays/`: birthday rules, such as date parsing and who can set birthdays, and the `BirthdayRepository` interface that commands use instead of the database.
- `src/infra/`: technical details and adapters to external services, such as logging and YouTube (`yt-dlp`). Put new adapters here.
- `src/infra/db/`: the MongoDB connection (Mongoose) and, in `models/`, the Mongoose schemas.
- `src/repositories/`: implementations of the domain's repository interfaces, such as `BirthdayRepository`, on top of the models in `src/infra/db/models/`.
- `/play` searches YouTube by default; links are resolved by the `LinkResolver` (`src/music/track-resolver.ts`) for their site. A new music source is a `LinkResolver` in `src/infra/` added to the registry in `/play`; it should not require other changes to the command.
- `src/index.ts`: entry point that wires the bot together.

## Implementation and validation

- Add or update relevant tests for each implemented requirement.
- Keep tests in `test/`, next to `src/`, mirroring its structure: the tests for `src/<path>/<name>.ts` live in `test/<path>/<name>.test.ts` (for example, `src/commands/play.ts` → `test/commands/play.test.ts`). Every module with behavior in `src/` must have a matching test file.
- Run the applicable tests, static checks, and build; report the commands and results.
- Keep test coverage at or above 90% of lines, branches, and functions (`npm run test:coverage`); the pre-push hook and CI enforce it. Replace external services (yt-dlp, Discord voice, HTTP) with fakes, such as `mock.module` or injected functions, so tests never use the network.
- Keep setup and operations documentation aligned with actual behavior.
- Do not implement features that depend on an audio provider until the provider and its terms of use have been evaluated and approved.

## Commits

- Use Conventional Commits: `<type>(optional scope): short description`, for example `feat: add music queue`.
- Use standard types such as `feat`, `fix`, `docs`, `refactor`, `test`, `build`, and `chore`.
- Do not add `Co-authored-by` trailers to commit messages.

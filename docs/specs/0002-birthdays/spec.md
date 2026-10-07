# Birthdays

- **Status:** Approved
- **Approver:** Project owner (2026-10-07)

## Context and goal

Let trusted members of a server record the birthdays of other members, so the bot can use them later (for example, to congratulate people on the day). This first step only stores birthdays; announcing them is a later feature.

## Users and preconditions

- The bot is installed in the server and connected to the database.
- The member using the command has one of the roles listed in `BIRTHDAY_MANAGER_ROLES`.
- The member whose birthday is recorded is a person in the server, not a bot.

## Functional requirements

- **FR-001 — Set a birthday:** `/birthday set user:<@member> date:<date>` records the member's birthday for the server where the command was used. The date is `DD/MM` (for example `15/03`) or `DD/MM/YYYY` (for example `15/03/1998`); the year is optional, so no one has to reveal their age. The command can be used in any text channel of the server.
- **FR-002 — Update:** setting the birthday of a member who already has one replaces it, and the reply says it was updated instead of saved.
- **FR-003 — Who can set birthdays:** only members with at least one role listed in `BIRTHDAY_MANAGER_ROLES` can use `/birthday set`. The variable is a comma-separated list of role names or role IDs (for example `admin,Moderador` or `123456789012345678`); names are compared without regard to case or surrounding spaces. Anyone else is refused privately. When the variable is empty or unset, no one can set birthdays, and the reply says the bot has not been configured for it.
- **FR-004 — Validation:** the date must exist (`31/04` is refused; `29/02` is accepted without a year and only in leap years with one), and a year must be from 1900 up to the current year without being in the future. Bots cannot have birthdays. Each refusal replies privately with the reason and the expected format.
- **FR-005 — What is stored:** for each birthday, the server ID, the member's user ID and username, the user ID of who set it, and when it was created and last updated. A date with a year is stored as a date (`birthDate`); a date without a year is stored as `day` and `month`, and a document has only one of the two forms. The username makes the data easier to read; since members can change it, it is refreshed each time the birthday is set, and the user ID remains the reference. The display name is not stored, because members change it freely. A member has at most one birthday per server. Changed by the project owner on 2026-10-07 from separate day, month, and year fields to a date, and to store the username.
- **FR-006 — Reply:** a successful command replies in the channel with the member and the date (for example "Saved @Ana's birthday: 15/03."), without pinging the member.
- **FR-007 — Database unavailable:** when the database is not configured or cannot be reached, `/birthday set` replies privately that birthdays cannot be saved right now, and the music commands keep working.

## Non-functional requirements

- **NFR-001:** the database connection string and credentials come from environment variables and are never logged or shown to users.
- **NFR-002:** the bot and the database run as containers with Docker Compose, and the database keeps its data across container restarts.
- **NFR-003:** tests do not use a real database; the storage is replaced with fakes.

## Acceptance criteria

- **AC-001:** with `BIRTHDAY_MANAGER_ROLES=admin`, a member with the `Admin` role runs `/birthday set user:@Ana date:15/03`; the bot replies "Saved @Ana's birthday: 15/03." without pinging Ana, and the database has one document with the server ID, Ana's user ID and username, day 15, month 3, no `birthDate`, and the admin's user ID.
- **AC-002:** running `/birthday set user:@Ana date:15/03/1998` afterwards replies that Ana's birthday was updated, and the document now has `birthDate` 1998-03-15 and no `day` or `month`.
- **AC-003:** a member without a listed role is refused privately and nothing is stored; with `BIRTHDAY_MANAGER_ROLES` unset, everyone is refused with a message about the missing configuration.
- **AC-004:** `31/04`, `29/02/2023`, `15/13`, `15-03`, `15/03/1899`, and a date later this year with the current year are refused with an explanation; `29/02` and `29/02/2024` are accepted.
- **AC-005:** `/birthday set` for a bot is refused.
- **AC-006:** with the database stopped, `/birthday set` replies that birthdays cannot be saved right now, and `/play` still works.
- **AC-007:** `docker compose up -d --build` starts the bot and MongoDB; after `docker compose restart`, birthdays saved before are still there.

## Out of scope

- Announcing birthdays, listing, viewing, or removing them (later subcommands of `/birthday`).
- Members setting their own birthday.
- Time zones; the date is a day and month without a time.

## Confirmed decisions

- **Database:** MongoDB, chosen by the project owner on 2026-10-07.
- **Database library:** Mongoose, chosen by the project owner on 2026-10-07, for schemas and validation over the official driver.
- **Containers:** Docker with Docker Compose for the bot and MongoDB, chosen by the project owner on 2026-10-07. This also settles hosting as containers for the bot; where the containers run is still open.
- **Command:** `/birthday set`, in English like the music commands, so later actions fit as subcommands.
- **Permission:** a comma-separated list of role names or IDs in `BIRTHDAY_MANAGER_ROLES`, so roles can be added without changing code.
- **Date:** day and month, with an optional year.

## Open decisions

- Whether members with the Administrator permission can set birthdays without a listed role (currently they need one).
- How and where birthdays are announced.

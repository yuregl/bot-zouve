# Birthday content

- **Status:** Approved
- **Approver:** Project owner (2026-10-07)

## Context and goal

Build, for each server, a collection of birthday messages and YouTube videos (for example, birthday memes in Russian, Hindi, or other languages) that the bot can later use to congratulate members on their birthday. This feature only manages the collection; posting on the day is a later feature.

## Users and preconditions

- The bot is installed in the server and connected to the database.
- The member using the commands has one of the roles listed in `BIRTHDAY_MANAGER_ROLES` (see [0002](../0002-birthdays/spec.md), FR-003).

## Functional requirements

- **FR-001 — Add a message:** `/birthday message add text:<message>` adds a birthday message to the server's collection. The text is 1 to 500 characters after trimming spaces. The reply is private and confirms what was added.
- **FR-002 — Add a video:** `/birthday video add link:<YouTube link>` adds a YouTube video to the server's collection. Only links to a single YouTube video are accepted (the same links `/play` accepts for one video; playlist parameters are ignored); the bot stores the video's standard link (`https://www.youtube.com/watch?v=<id>`). A video already in the server's collection is refused. The reply is private.
- **FR-003 — Shared collection:** content belongs to the server where it was added and can be used for any member's birthday; it is not tied to a member. Other servers do not see it.
- **FR-004 — List:** `/birthday content list` shows the server's content, oldest first, numbered from 1, with the type, the message (shortened when long) or the link, and who added it. Links are not expanded into previews. With no content, it says the collection is empty. The reply is private, so the content stays a surprise.
- **FR-005 — Remove:** `/birthday content remove number:<n>` removes the item with that number in `/birthday content list` and replies privately with what was removed. A number that does not exist is refused with how many items there are.
- **FR-006 — Who can use it:** every command in this feature requires a role listed in `BIRTHDAY_MANAGER_ROLES`, like `/birthday set`.
- **FR-007 — What is stored:** for each item, the server ID, the type (`message` or `video`), the text or the video link and ID, the user ID of who added it, and when it was added.
- **FR-008 — Database unavailable:** when the database is not configured or cannot be reached, the commands reply privately that birthday content cannot be changed right now.

## Non-functional requirements

- **NFR-001:** tests do not use a real database or YouTube; storage is replaced with fakes.
- **NFR-002:** adding a video does not call YouTube; the link is checked by its format only.

## Acceptance criteria

- **AC-001:** an admin runs `/birthday message add text:С днём рождения! 🎉`; the reply confirms it, and the collection has one `message` item with that text and the admin's user ID.
- **AC-002:** `/birthday video add link:https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RD1` stores `https://www.youtube.com/watch?v=dQw4w9WgXcQ`; adding `https://youtu.be/dQw4w9WgXcQ` afterwards is refused as a duplicate; `https://example.com/video` and a playlist link without a video are refused.
- **AC-003:** with two messages and one video added in that order, `/birthday content list` shows them as 1, 2, and 3; `/birthday content remove number:2` removes the second message, and the list then shows two items; `/birthday content remove number:5` is refused, saying there are two items.
- **AC-004:** a member without a listed role is refused for every command, and nothing changes.
- **AC-005:** an empty message, or one over 500 characters, is refused.
- **AC-006:** with the database stopped, each command replies that birthday content cannot be changed right now.

## Decision history

- 2026-10-07: listing and removing content moved from `/birthday list` and `/birthday remove` to `/birthday content list` and `/birthday content remove`, because the project owner decided `/birthday list` shows members' birthdays ([0002](../0002-birthdays/spec.md), FR-008).

## Out of scope

- Posting messages and videos on members' birthdays.
- Content for a specific member, editing items, and uploading video files.
- Checking that a video exists or is available when it is added. Videos are checked before they are sent ([0004](../0004-birthday-announcements/spec.md), FR-004), and `/birthday content list` marks the unavailable ones.

## Confirmed decisions

- **Collection per server**, shared by all birthdays, decided by the project owner on 2026-10-07 (instead of content for a specific member).
- **Permission:** the roles in `BIRTHDAY_MANAGER_ROLES`, decided by the project owner on 2026-10-07.
- **Videos:** YouTube links only.

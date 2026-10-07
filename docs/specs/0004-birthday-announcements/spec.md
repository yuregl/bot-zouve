# Birthday announcements

- **Status:** Approved
- **Approver:** Project owner (2026-10-07)

## Context and goal

On a member's birthday, the bot congratulates them in the server with a message and a video from the server's birthday collection ([0003](../0003-birthday-content/spec.md)). Videos can stop working after they are added (deleted, made private, or with embedding turned off), so the bot checks a video before sending it.

## Users and preconditions

- The member's birthday is saved with `/birthday set` ([0002](../0002-birthdays/spec.md)).
- The server has the `#zouve-music` channel (created by `/setup`), and the bot can send messages there.
- The bot is connected to the database.

## Functional requirements

- **FR-001 — When:** every day at `BIRTHDAY_ANNOUNCE_TIME` (default `09:00`) in the `America/Sao_Paulo` time zone, the bot congratulates each member whose birthday is that day. A 29/02 birthday is congratulated on 28/02 in years that are not leap years. When the bot is offline at that time, it congratulates when it comes back the same day.
- **FR-002 — Where:** in the server's `#zouve-music` channel. A server without that channel, or where the bot cannot send there, is skipped and logged, and the bot tries again later that day.
- **FR-003 — One message per member:** each member gets their own message, which mentions them (notifying them) and has festive emojis, a message drawn at random from the server's collection, and a video drawn at random from the server's collection. With no messages in the collection, a default congratulation is used; with no working video, the message is sent without a video.
- **FR-004 — Video check:** before sending a video, the bot asks YouTube's oEmbed service whether the video can be shown. A deleted, private, or not embeddable video is marked as unavailable, and another video is drawn. A video marked unavailable that works again is marked available. When YouTube cannot be reached, that video is skipped for this message without being marked.
- **FR-005 — Once a year:** a member is congratulated at most once per birthday, even if the bot restarts; a message that fails to send is tried again later that day.
- **FR-006 — Only the birthday member is notified:** text from the collection cannot notify `@everyone`, `@here`, roles, or other members.
- **FR-007 — Unavailable videos in the list:** `/birthday content list` marks unavailable videos with ⚠️.

## Non-functional requirements

- **NFR-001:** `BIRTHDAY_ANNOUNCE_TIME` is optional, written as `HH:MM`; the bot does not start when it is invalid.
- **NFR-002:** the video check needs no API key and times out after 5 seconds.
- **NFR-003:** tests use fakes for Discord, the database, YouTube, and the clock.

## Acceptance criteria

- **AC-001:** at 09:00 on 24/08, a member with that birthday gets a message in `#zouve-music` that mentions them, with a message and a video from the collection; members with other birthdays get nothing.
- **AC-002:** with the bot restarted at 10:00 the same day, the member is not congratulated again; with the bot started for the first time that day at 14:00, they are congratulated then.
- **AC-003:** when the drawn video was deleted from YouTube, the message has another video, and `/birthday content list` shows the deleted one with ⚠️; with every video unavailable, the message is sent without a video.
- **AC-004:** a collection message containing `@everyone` does not notify anyone besides the birthday member.
- **AC-005:** with two birthdays on the same day, each member gets a separate message.
- **AC-006:** with no messages in the collection, the message uses the default congratulation.

## Out of scope

- Choosing the channel or the time per server.
- Congratulating in voice channels or playing the video's audio.
- Removing unavailable videos automatically.

## Confirmed decisions

- **Channel:** the bot's own `#zouve-music` channel, decided by the project owner on 2026-10-07.
- **Time:** 9:00 in the morning (São Paulo), configurable in `BIRTHDAY_ANNOUNCE_TIME`, following the owner's request to keep times in environment variables.
- **Content:** a message and a video from the collection, mentioning the member, one message per member, decided by the project owner on 2026-10-07.
- **Video check:** before sending, with YouTube's oEmbed service; broken videos are marked unavailable, not removed, decided by the project owner on 2026-10-07.

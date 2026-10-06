# Discord Music Bot

- **Status:** Draft
- **Approver:** Pending

## Context and goal

Create a bot for Discord servers that lets members control music in a voice channel using slash commands. This specification defines the proposed initial scope; it does not yet authorize a choice of technology or audio source.

## Users and preconditions

- The user is in a server where the bot is installed.
- To start or control playback, the user is connected to a voice channel the bot can access.
- The bot has the permissions required to join the channel and respond to commands.

## Functional requirements

- **FR-001 — Play:** `/p <query>` and `/play <query>` are aliases that add a track to the queue and start playback if no other track is playing. Search terms and direct links may be accepted only through an approved, authorized audio source.
- **FR-002 — Pause and resume:** `/pause` pauses the current playback and `/resume` resumes paused playback, replying with the resumed track. Both only work in `#zouve-music` and when the user is in the same voice channel as the bot; `/resume` replies privately when nothing is playing or playback is not paused.
- **FR-003 — Skip:** `/skip` ends the current track (also when paused) and attempts to start the next track in the queue, replying with the skipped track and the next one, or that the queue is now empty. It only works in `#zouve-music` and when the user is in the same voice channel as the bot; when nothing is playing, it replies privately.
- **FR-004 — Stop:** `/stop` ends the current track and clears the queue; the bot stays in the voice channel (use `/leave` to disconnect). It only works in `#zouve-music` and when the user is in the same voice channel as the bot; when nothing is playing or queued, it replies privately. Decided by the project owner on 2026-10-04, replacing the earlier draft in which `/stop` also disconnected.
- **FR-005 — View queue:** `/queue` displays the current track (marked when paused, with the elapsed time) and the next 10 queued tracks in order, each with its duration and who requested it, followed by how many more tracks are queued and the total number of tracks and duration. Any member can use it in `#zouve-music` without being in a voice channel, and the reply is visible to everyone in the channel; when nothing is playing or queued, it replies privately. Decided by the project owner on 2026-10-04.
- **FR-006 — Current track:** removed from scope by the project owner on 2026-10-05; `/queue` already shows the current track, and the bot announces each track when it starts.
- **FR-007 — Volume:** removed from scope by the project owner on 2026-10-05. Changing the volume would require decoding and re-encoding the audio, which the Opus passthrough avoids; listeners can adjust the bot's volume in their own Discord client.
- **FR-008 — Repeat:** removed from scope by the project owner on 2026-10-05.
- **FR-009 — Permissions and state:** commands that depend on playback or a voice channel validate the current state and return a useful message when an action cannot be performed.
- **FR-010 — Session scope:** the queue and playback controls belong to the Discord server that started the session; an action in one server does not affect another.
- **FR-011 — Help:** `/help` lists the bot's commands and descriptions; commands still in development, if any, are listed separately as not yet available.
- **FR-012 — Music channel:** `/setup`, available to members with Manage Channels, creates a `#zouve-music` text channel if it does not exist (the bot needs Manage Channels to do so). The bot finds the channel by name, so no storage is needed. Music commands (`/play`, `/p`, `/pause`, `/resume`, `/seek`, `/skip`, `/stop`, `/leave`, `/queue`, `/remove`, and future playback commands) only work in that channel; elsewhere, or when it does not exist, they reply privately with a link to the channel or instructions to run `/setup`. The bot posts in the channel when a track is added to the queue, when a track starts playing (title, duration, link, and who requested it), and when a track fails and is skipped.
- **FR-013 — Leave:** `/leave` disconnects the bot from the server's voice channel, ending playback and discarding the queue. It only works in `#zouve-music`, while the bot is connected, and when the user is in the same voice channel as the bot; otherwise it replies privately with the reason. `/stop` (FR-004) ends playback without disconnecting.
- **FR-014 — Seek:** `/seek <time>` restarts the current track at the given position, written as on YouTube's player: `m:ss` (for example `2:13`) or `h:mm:ss` (for example `1:02:30`); plain seconds are not accepted. A paused track resumes from that position, and the track is not announced again. A position at or past the end of the track is refused privately, as is `/seek` when nothing is playing. It only works in `#zouve-music` when the user is in the same voice channel as the bot. `/queue` shows how far into the current track playback is. Decided by the project owner on 2026-10-05.
- **FR-015 — Remove:** `/remove <position>` removes the track at that position from the queue, using the numbers listed under "Up next" in `/queue` (1 is the next track; the current track is not numbered, and `/skip` ends it). It replies with the removed track; when the queue is empty or the position does not exist, it replies privately with how many tracks are queued. It only works in `#zouve-music` when the user is in the same voice channel as the bot. Requested by the project owner on 2026-10-05.
- **FR-016 — Spotify links:** `/play` accepts a link to a single Spotify track. The bot reads the track's title, artists, and duration from Spotify, searches YouTube for "artists - title", and plays the result whose duration is closest to the Spotify track's among the first five, skipping live streams; the track is shown with Spotify's artists and title. Links to Spotify albums, playlists, and other content are refused. Text that is not a link is still searched on YouTube. Decided by the project owner on 2026-10-05.

## Non-functional requirements

- **NFR-001:** command responses must be clear and appropriate for Discord's interface.
- **NFR-002:** errors from the audio provider and Discord must be reported without implying false success.
- **NFR-003:** tokens and secrets must not be written to code, user-facing messages, or logs.
- **NFR-004:** the audio source must be selected and evaluated for availability, compatibility, and terms of use before playback is implemented.

## Acceptance criteria

- **AC-001:** `/play` in a server with no active playback starts the first track accepted by the approved provider.
- **AC-002:** `/play` during playback adds the new track to the queue without interrupting the current track.
- **AC-003:** pause and resume affect active playback, and invalid requests receive an explanatory response.
- **AC-004:** skip starts the next track when one is queued; stop ends the current track and clears the queue while the bot stays in the voice channel.
- **AC-005:** queues and controls in different servers remain isolated.
- **AC-006:** commands invoked without required preconditions do not fail silently or perform actions in unintended channels.
- **AC-007:** removed along with FR-007 and FR-008.
- **AC-008:** `/help` responds with the list of commands and clearly indicates any that are not yet available.
- **AC-009:** `/p` and `/play` invoke the same playback behavior when an authorized audio source has been configured.
- **AC-010:** `/setup` creates `#zouve-music` once and reports the existing channel on later runs; music commands used outside it are refused with a private message pointing to it.
- **AC-011:** `/leave` from the bot's voice channel disconnects the bot and clears the queue; it is refused privately when the bot is not connected or the user is not in the same voice channel.
- **AC-012:** `/queue` with a track playing and 13 queued shows the current track, the next 10, "…and 3 more tracks", and the total of 14 tracks with their combined duration; with nothing playing or queued, it replies privately that the queue is empty.
- **AC-013:** `/play never gonna give you up` plays the first YouTube result for those terms and reports its title; a search with no results, or whose first result is a live stream, is refused with an explanation; a link to another site is refused without searching.
- **AC-014:** `/seek 2:13` during a 3:33 track continues playback from 2:13 and `/queue` then shows about 2:13 elapsed; `/seek 4:00` on that track and `/seek 133` are refused with an explanation.
- **AC-015:** with three tracks under "Up next", `/remove 2` removes the second one and `/queue` then lists the other two as 1 and 2; `/remove 5` is refused, saying the queue has two tracks.
- **AC-016:** `/play` with the Spotify link for Linkin Park's "Numb" plays a YouTube video of that song with about the same duration and shows "Linkin Park - Numb"; a Spotify album or playlist link is refused, listing the supported links.

## Out of scope

- Audio playback or infrastructure setup before the provider and technology have been selected.
- Administrative commands, persistent playlists, advanced search, recommendations, a web dashboard, and monetization.
- Simultaneous playback in multiple channels of the same server.
- A separate current-track command (`/nowplaying`), volume control (`/volume`), and repeat modes (`/loop`); see FR-006, FR-007, and FR-008.

## Confirmed decisions

- **Language:** TypeScript.
- **Discord library:** `discord.js`, a community-maintained library for the Discord API; Discord does not provide a general official SDK for TypeScript bots.
- **Voice library:** `@discordjs/voice` for Discord voice connections and audio playback.
- **Audio source:** YouTube video links via `yt-dlp`, run through the `youtube-dl-exec` package (which downloads the `yt-dlp` binary on install), selected by the project owner on 2026-10-04. It replaced `@distube/ytdl-core`, which could no longer extract any YouTube video ("Failed to find any playable formats") and has not been updated since June 2025. `yt-dlp` uses the bot's own Node.js as its JavaScript runtime for YouTube extraction. Playlist and radio parameters in a link are ignored; only the video is played. Individual YouTube video links are accepted; any other text that is not a link is searched on YouTube through `yt-dlp` (`ytsearch1:`) and the first result is played, as decided by the project owner on 2026-10-05; links to other sites or to playlists are refused. Playlists and live streams are not supported yet. Audio is streamed as WebM/Opus without re-encoding, so no FFmpeg or Opus encoder is required. To start playback faster, the direct audio link that `yt-dlp` returns when `/play` resolves a track is downloaded in 1 MiB ranges (YouTube resets single full-file requests) instead of running `yt-dlp` again; the link expires after about six hours, so when the next track's link would expire before it plays, it is refreshed in the background while the current track plays. If the direct link is expired or fails before any audio is sent, playback falls back to `yt-dlp`, which is tried twice because YouTube occasionally rejects a download (HTTP 403) that succeeds on retry; a failure after audio has started skips the track. Spotify is used for metadata only, through the Spotify Web API with the client credentials flow (no user login; `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`), because Spotify does not provide audio to third-party apps; selected by the project owner on 2026-10-05. Known risk: Spotify's Developer Terms allow reading track metadata, but using it to find and play the same song from another service is a gray area, and Spotify has restricted parts of the Web API for new apps. Known risks: retrieving YouTube audio this way is not covered by YouTube's Terms of Service, and the extractor can break when YouTube changes its site; `yt-dlp` is updated frequently, so keep `youtube-dl-exec` up to date.
- **Tests:** Node.js built-in test runner (`node --test`) executed through `tsx`.
- **Linting:** Oxlint, which implements ESLint and typescript-eslint rules. ESLint itself was not used because `typescript-eslint` requires TypeScript below 6.1 and the project uses TypeScript 7. Type-aware rules are not enabled.
- **Initial minimum runtime:** Node.js 22.12, compatible with the initial setup and the selected library version.

## Open decisions

- Audio provider(s) and input formats, including an evaluation of applicable terms of use and restrictions.
- Command access policy: any member or only users with specific roles/permissions.
- Maximum queue size and behavior when the queue ends.
- Hosting, persistence needs, and recovery strategy after failures.
- Final name, response language, and handling of concurrent interactions in a server.
- Whether the bot disconnects automatically when the queue ends (it currently stays connected).

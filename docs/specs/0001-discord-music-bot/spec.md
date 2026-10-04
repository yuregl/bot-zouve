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
- **FR-002 — Pause and resume:** `/pause` pauses the current playback and `/resume` resumes paused playback.
- **FR-003 — Skip:** `/skip` ends the current track and attempts to start the next track in the queue.
- **FR-004 — Stop:** `/stop` ends playback, clears the queue, and disconnects the bot from the voice channel.
- **FR-005 — View queue:** `/queue` displays queued tracks in order.
- **FR-006 — Current track:** `/nowplaying` reports the track currently playing or that no track is active.
- **FR-007 — Volume:** `/volume <value>` adjusts the volume within a range to be defined in the technical plan.
- **FR-008 — Repeat:** `/loop <mode>` can disable repeat or repeat the current track or the queue; exact modes and semantics need confirmation.
- **FR-009 — Permissions and state:** commands that depend on playback or a voice channel validate the current state and return a useful message when an action cannot be performed.
- **FR-010 — Session scope:** the queue and playback controls belong to the Discord server that started the session; an action in one server does not affect another.
- **FR-011 — Help:** `/help` lists the bot's commands and descriptions, distinguishing available commands from those still in development.
- **FR-012 — Music channel:** `/setup`, available to members with Manage Channels, creates a `#zouve-music` text channel if it does not exist (the bot needs Manage Channels to do so). The bot finds the channel by name, so no storage is needed. Music commands (`/play`, `/p`, `/pause`, and future playback commands) only work in that channel; elsewhere, or when it does not exist, they reply privately with a link to the channel or instructions to run `/setup`. The bot posts in the channel when a track is added to the queue, when a track starts playing (title, duration, link, and who requested it), and when a track fails and is skipped.

## Non-functional requirements

- **NFR-001:** command responses must be clear and appropriate for Discord's interface.
- **NFR-002:** errors from the audio provider and Discord must be reported without implying false success.
- **NFR-003:** tokens and secrets must not be written to code, user-facing messages, or logs.
- **NFR-004:** the audio source must be selected and evaluated for availability, compatibility, and terms of use before playback is implemented.

## Acceptance criteria

- **AC-001:** `/play` in a server with no active playback starts the first track accepted by the approved provider.
- **AC-002:** `/play` during playback adds the new track to the queue without interrupting the current track.
- **AC-003:** pause and resume affect active playback, and invalid requests receive an explanatory response.
- **AC-004:** skip starts the next track when one is queued; stop clears the queue and disconnects the bot.
- **AC-005:** queues and controls in different servers remain isolated.
- **AC-006:** commands invoked without required preconditions do not fail silently or perform actions in unintended channels.
- **AC-007:** repeat modes and volume limits follow the decisions approved before implementation.
- **AC-008:** `/help` responds with a list of planned commands and clearly indicates which are not yet available.
- **AC-009:** `/p` and `/play` invoke the same playback behavior when an authorized audio source has been configured.
- **AC-010:** `/setup` creates `#zouve-music` once and reports the existing channel on later runs; music commands used outside it are refused with a private message pointing to it.

## Out of scope

- Audio playback or infrastructure setup before the provider and technology have been selected.
- Administrative commands, persistent playlists, advanced search, recommendations, a web dashboard, and monetization.
- Simultaneous playback in multiple channels of the same server.

## Confirmed decisions

- **Language:** TypeScript.
- **Discord library:** `discord.js`, a community-maintained library for the Discord API; Discord does not provide a general official SDK for TypeScript bots.
- **Voice library:** `@discordjs/voice` for Discord voice connections and audio playback.
- **Audio source:** YouTube video links via `yt-dlp`, run through the `youtube-dl-exec` package (which downloads the `yt-dlp` binary on install), selected by the project owner on 2026-10-04. It replaced `@distube/ytdl-core`, which could no longer extract any YouTube video ("Failed to find any playable formats") and has not been updated since June 2025. `yt-dlp` uses the bot's own Node.js as its JavaScript runtime for YouTube extraction. Playlist and radio parameters in a link are ignored; only the video is played. Only individual YouTube video links are accepted; search by name, playlists, and live streams are not supported yet. Audio is streamed as WebM/Opus without re-encoding, so no FFmpeg or Opus encoder is required. Known risks: retrieving YouTube audio this way is not covered by YouTube's Terms of Service, and the extractor can break when YouTube changes its site; `yt-dlp` is updated frequently, so keep `youtube-dl-exec` up to date.
- **Tests:** Node.js built-in test runner (`node --test`) executed through `tsx`.
- **Initial minimum runtime:** Node.js 22.12, compatible with the initial setup and the selected library version.

## Open decisions

- Audio provider(s) and input formats, including an evaluation of applicable terms of use and restrictions.
- Command access policy: any member or only users with specific roles/permissions.
- `/loop` and `/volume` semantics and limits; maximum queue size and behavior when the queue ends.
- Hosting, persistence needs, and recovery strategy after failures.
- Final name, response language, and handling of concurrent interactions in a server.
- Search by name for `/p` and `/play`, and whether the bot disconnects automatically when the queue ends (it currently stays connected).

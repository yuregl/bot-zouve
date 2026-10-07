import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  type AudioPlayer,
  type AudioResource,
  type VoiceConnection,
} from "@discordjs/voice";
import { EmbedBuilder, type MessageCreateOptions, type VoiceBasedChannel } from "discord.js";
import { formatDuration, type Track } from "./track.js";
import { createSeekedOpusStream } from "../infra/opus.js";
import { createYouTubeStream, needsFreshAudio, refreshAudioSource } from "../infra/youtube.js";
import { createLogger } from "../infra/logger.js";

const logger = createLogger("music");

/** How long the bot stays in the voice channel with nothing playing or queued. */
export const IDLE_TIMEOUT_MS = 5 * 60_000;

type Notify = (message: string | MessageCreateOptions) => void;

interface GuildSession {
  connection: VoiceConnection;
  player: AudioPlayer;
  queue: Track[];
  current?: Track;
  /** Where the current track's audio started, in seconds; set by seeking. */
  startOffsetSeconds: number;
  /** True while a seek restarts the current track, so it is not announced again. */
  seeking: boolean;
  /** Disconnects the bot when it fires; set while nothing is playing or queued. */
  idleTimer?: NodeJS.Timeout;
  notify: Notify;
}

export interface QueueSnapshot {
  current?: Track;
  /** How far into the current track playback is, in seconds; undefined when nothing is playing. */
  elapsedSeconds?: number;
  paused: boolean;
  upcoming: Track[];
}

export type ResourceFactory = (track: Track, offsetSeconds: number) => AudioResource;

export type RemoveOutcome =
  | { status: "removed"; track: Track }
  | { status: "empty" }
  | { status: "out-of-range"; size: number };

export type SeekOutcome =
  | { status: "seeked"; track: Track }
  | { status: "not-playing" }
  | { status: "out-of-range"; track: Track };

export interface SkipResult {
  skipped: Track;
  next?: Track;
}

export interface EnqueueResult {
  startedPlaying: boolean;
  position: number;
}

export class MusicManager {
  private readonly sessions = new Map<string, GuildSession>();
  private readonly pendingSessions = new Map<string, Promise<GuildSession>>();

  /** `createResource` streams a track from a position; tests replace it to avoid downloading audio. */
  constructor(private readonly createResource: ResourceFactory = createTrackResource) {}

  getAudioPlayer(guildId: string): AudioPlayer | undefined {
    return this.sessions.get(guildId)?.player;
  }

  /** The voice channel the bot is in, or still connecting to, in the guild. */
  getVoiceChannelId(guildId: string): string | undefined {
    const connection = this.sessions.get(guildId)?.connection ?? getVoiceConnection(guildId);
    return connection?.joinConfig.channelId ?? undefined;
  }

  /** Returns a copy of the guild's current track and queue, or undefined when there is no session. */
  getQueue(guildId: string): QueueSnapshot | undefined {
    const session = this.sessions.get(guildId);

    if (!session) {
      return undefined;
    }

    const state = session.player.state;
    const playedMs = state.status === AudioPlayerStatus.Idle ? 0 : state.resource.playbackDuration;

    return {
      current: session.current,
      elapsedSeconds: session.current ? session.startOffsetSeconds + playedMs / 1000 : undefined,
      paused: state.status === AudioPlayerStatus.Paused,
      upcoming: [...session.queue],
    };
  }

  /**
   * Restarts the current track at the given position, resuming it if it was paused.
   * Positions past the end of a track with a known duration are refused.
   */
  seek(guildId: string, positionSeconds: number): SeekOutcome {
    const session = this.sessions.get(guildId);
    const track = session?.current;

    if (!session || !track) {
      return { status: "not-playing" };
    }

    if (track.durationSeconds > 0 && positionSeconds >= track.durationSeconds) {
      return { status: "out-of-range", track };
    }

    session.startOffsetSeconds = positionSeconds;
    session.seeking = true;
    // Replacing the resource destroys the old stream without emitting Idle, so the queue
    // does not advance.
    session.player.play(this.createResource(track, positionSeconds));
    logger.info("Seeked", { guild: guildId, track: track.title, positionSeconds });
    return { status: "seeked", track };
  }

  /** Pauses the playing track; returns false when nothing is playing or the player refuses. */
  pause(guildId: string): boolean {
    const session = this.sessions.get(guildId);

    if (!session?.current || session.player.state.status !== AudioPlayerStatus.Playing) {
      return false;
    }

    return session.player.pause();
  }

  /** Resumes a paused track; returns false when nothing is paused or the player refuses. */
  resume(guildId: string): boolean {
    const session = this.sessions.get(guildId);

    if (!session?.current || session.player.state.status !== AudioPlayerStatus.Paused) {
      return false;
    }

    return session.player.unpause();
  }

  /**
   * Removes the track at a 1-based position among the upcoming tracks, as numbered by /queue.
   * The current track is not part of that numbering.
   */
  remove(guildId: string, position: number): RemoveOutcome {
    const session = this.sessions.get(guildId);
    const size = session?.queue.length ?? 0;

    if (!session || size === 0) {
      return { status: "empty" };
    }

    if (!Number.isInteger(position) || position < 1 || position > size) {
      return { status: "out-of-range", size };
    }

    const [track] = session.queue.splice(position - 1, 1);

    // The track now next may have an older link than the one that was removed.
    if (position === 1 && session.current) {
      prepareUpcomingTrack(session.queue[0], session.current);
    }

    logger.info("Track removed from the queue", { guild: guildId, track: track?.title, position });
    return track ? { status: "removed", track } : { status: "out-of-range", size };
  }

  /** Ends the current track so the next queued track starts; returns undefined when nothing is playing. */
  skip(guildId: string): SkipResult | undefined {
    const session = this.sessions.get(guildId);

    if (!session?.current) {
      return undefined;
    }

    const result = { skipped: session.current, next: session.queue[0] };
    // Stopping emits Idle, which starts the next queued track.
    session.player.stop(true);
    return result;
  }

  /** Ends the current track and clears the queue while staying in the voice channel. */
  stop(guildId: string): boolean {
    const session = this.sessions.get(guildId);

    if (!session || (!session.current && session.queue.length === 0)) {
      return false;
    }

    // Clear the queue first so the Idle handler has nothing to start.
    session.queue.length = 0;
    session.player.stop(true);
    return true;
  }

  /** Disconnects from the guild's voice channel, ending playback and discarding the queue. */
  leave(guildId: string): boolean {
    const session = this.sessions.get(guildId);

    if (!session) {
      return false;
    }

    session.connection.destroy();
    return true;
  }

  async enqueue(channel: VoiceBasedChannel, track: Track, notify: Notify): Promise<EnqueueResult> {
    const session = await this.getOrCreateSession(channel, notify);
    session.notify = notify;
    session.queue.push(track);

    if (session.player.state.status === AudioPlayerStatus.Idle && !session.current) {
      this.playNext(channel.guild.id);
      return { startedPlaying: true, position: 0 };
    }

    return { startedPlaying: false, position: session.queue.length };
  }

  private async getOrCreateSession(channel: VoiceBasedChannel, notify: Notify): Promise<GuildSession> {
    const guildId = channel.guild.id;
    const existing = this.sessions.get(guildId) ?? this.pendingSessions.get(guildId);

    if (existing) {
      return existing;
    }

    const pending = this.createSession(channel, notify);
    this.pendingSessions.set(guildId, pending);

    try {
      return await pending;
    } finally {
      this.pendingSessions.delete(guildId);
    }
  }

  private async createSession(channel: VoiceBasedChannel, notify: Notify): Promise<GuildSession> {
    const guildId = channel.guild.id;
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    const context = { guild: channel.guild.name, voiceChannel: channel.name };
    logger.info("Joining voice channel", context);

    connection.on("stateChange", (oldState, newState) => {
      logger.debug("Voice connection state changed", { ...context, from: oldState.status, to: newState.status });
    });
    connection.on("error", (error) => logger.error("Voice connection error", context, error));

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (error) {
      logger.error("Voice connection did not become ready within 20s", {
        ...context,
        status: connection.state.status,
      }, error);
      connection.destroy();
      throw new Error("Could not connect to the voice channel.", { cause: error });
    }

    const player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });
    connection.subscribe(player);

    const session: GuildSession = { connection, player, queue: [], startOffsetSeconds: 0, seeking: false, notify };
    this.sessions.set(guildId, session);

    player.on("stateChange", (oldState, newState) => {
      logger.debug("Audio player state changed", {
        ...context,
        from: oldState.status,
        to: newState.status,
        track: session.current?.title,
      });
    });

    player.on(AudioPlayerStatus.Idle, () => {
      session.current = undefined;
      this.playNext(guildId);
    });

    player.on(AudioPlayerStatus.Playing, (oldState) => {
      if (session.seeking) {
        session.seeking = false;
        return;
      }
      // Only announce new tracks, not resumes from a pause.
      if (oldState.status === AudioPlayerStatus.Buffering && session.current) {
        logger.info("Track started", { ...context, track: session.current.title, url: session.current.url });
        session.notify({ embeds: [buildNowPlayingEmbed(session.current)] });
      }
    });

    player.on("error", (error) => {
      logger.error("Audio player error", { ...context, track: session.current?.title, url: session.current?.url }, error);
      const title = session.current?.title ?? "the current track";
      session.notify(`Could not play **${title}**. Skipping to the next track.`);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // Moving between channels briefly disconnects; wait to see if it reconnects.
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        logger.warn("Voice connection lost and did not recover; leaving", context);
        connection.destroy();
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      logger.info("Voice session closed", context);
      clearTimeout(session.idleTimer);
      // Remove the session before stopping so the Idle handler does not start the next track.
      this.sessions.delete(guildId);
      session.queue.length = 0;
      player.stop(true);
    });

    return session;
  }

  private playNext(guildId: string): void {
    const session = this.sessions.get(guildId);
    const next = session?.queue.shift();

    if (!session || !next) {
      if (session) {
        logger.info("Queue finished", { guild: guildId });
        this.startIdleTimer(guildId, session);
      }
      return;
    }

    clearTimeout(session.idleTimer);
    session.idleTimer = undefined;

    try {
      const resource = this.createResource(next, 0);
      session.current = next;
      session.startOffsetSeconds = 0;
      session.seeking = false;
      session.player.play(resource);
      prepareUpcomingTrack(session.queue[0], next);
    } catch (error) {
      logger.error("Failed to start track", { guild: guildId, track: next.title, url: next.url }, error);
      session.notify(`Could not play **${next.title}**. Skipping to the next track.`);
      this.playNext(guildId);
    }
  }

  private startIdleTimer(guildId: string, session: GuildSession): void {
    clearTimeout(session.idleTimer);
    session.idleTimer = setTimeout(() => {
      session.idleTimer = undefined;

      if (this.sessions.get(guildId) !== session || session.current || session.queue.length > 0) {
        return;
      }

      const minutes = IDLE_TIMEOUT_MS / 60_000;
      logger.info("Leaving voice channel after being idle", { guild: guildId, minutes });
      session.notify(`Left the voice channel after ${minutes} minutes without music.`);
      session.connection.destroy();
    }, IDLE_TIMEOUT_MS);
  }
}

function createTrackResource(track: Track, offsetSeconds: number): AudioResource {
  const webm = createYouTubeStream(track);

  // WebM/Opus goes to Discord as is; seeking demuxes it into Opus packets to drop the start.
  return offsetSeconds > 0
    ? createAudioResource(createSeekedOpusStream(webm, offsetSeconds), { inputType: StreamType.Opus })
    : createAudioResource(webm, { inputType: StreamType.WebmOpus });
}

/**
 * Refreshes the next track's audio link in the background when it would expire before the
 * current track ends, so the next track can start without waiting for yt-dlp.
 */
export function prepareUpcomingTrack(
  upcoming: Track | undefined,
  playing: Track,
  refresh: (track: Track) => Promise<void> = refreshAudioSource,
  now = Date.now(),
): void {
  if (upcoming && needsFreshAudio(upcoming, now + playing.durationSeconds * 1000)) {
    void refresh(upcoming);
  }
}

function buildNowPlayingEmbed(track: Track): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Now playing")
    .setDescription(`[${track.title}](${track.url})`)
    .addFields(
      { name: "Duration", value: formatDuration(track.durationSeconds), inline: true },
      { name: "Requested by", value: `<@${track.requestedBy}>`, inline: true },
    );
}

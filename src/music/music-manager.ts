import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
  type AudioPlayer,
  type VoiceConnection,
} from "@discordjs/voice";
import { EmbedBuilder, type MessageCreateOptions, type VoiceBasedChannel } from "discord.js";
import { formatDuration, type Track } from "./track.js";
import { createYouTubeStream, needsFreshAudio, refreshAudioSource } from "./youtube.js";
import { createLogger } from "../logger.js";

const logger = createLogger("music");

type Notify = (message: string | MessageCreateOptions) => void;

interface GuildSession {
  connection: VoiceConnection;
  player: AudioPlayer;
  queue: Track[];
  current?: Track;
  notify: Notify;
}

export interface QueueSnapshot {
  current?: Track;
  paused: boolean;
  upcoming: Track[];
}

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

  getAudioPlayer(guildId: string): AudioPlayer | undefined {
    return this.sessions.get(guildId)?.player;
  }

  getVoiceChannelId(guildId: string): string | undefined {
    return this.sessions.get(guildId)?.connection.joinConfig.channelId ?? undefined;
  }

  /** Returns a copy of the guild's current track and queue, or undefined when there is no session. */
  getQueue(guildId: string): QueueSnapshot | undefined {
    const session = this.sessions.get(guildId);

    if (!session) {
      return undefined;
    }

    return {
      current: session.current,
      paused: session.player.state.status === AudioPlayerStatus.Paused,
      upcoming: [...session.queue],
    };
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

    const session: GuildSession = { connection, player, queue: [], notify };
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
      }
      return;
    }

    try {
      const resource = createAudioResource(createYouTubeStream(next), {
        inputType: StreamType.WebmOpus,
      });
      session.current = next;
      session.player.play(resource);
      prepareUpcomingTrack(session.queue[0], next);
    } catch (error) {
      logger.error("Failed to start track", { guild: guildId, track: next.title, url: next.url }, error);
      session.notify(`Could not play **${next.title}**. Skipping to the next track.`);
      this.playNext(guildId);
    }
  }
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

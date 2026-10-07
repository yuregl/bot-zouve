import {
  type ChatInputCommandInteraction,
  type MessageCreateOptions,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./command.js";
import { createLogger } from "../infra/logger.js";
import type { MusicManager } from "../music/music-manager.js";
import { formatDuration } from "../music/track.js";
import { requireMusicChannel } from "./require-music-channel.js";
import { createSpotifyLinkResolver } from "../infra/spotify.js";
import { searchYouTubeByDuration, youtubeLinkResolver, youtubeSearchResolver } from "../infra/youtube.js";
import { TrackResolverRegistry, UnsupportedTrackError } from "../music/track-resolver.js";

const logger = createLogger("play");

// Links are resolved by their site; any other text is searched on YouTube.
const trackResolvers = new TrackResolverRegistry({
  links: [youtubeLinkResolver, createSpotifyLinkResolver(searchYouTubeByDuration)],
  fallback: youtubeSearchResolver,
});

// Long enough for a song title and artist; a search query this long is almost certainly a mistake.
const MAX_QUERY_LENGTH = 200;

function buildPlayCommand(name: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription("Plays a song name, a YouTube video or playlist link, or a Spotify track link.")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("Song name to search on YouTube, a YouTube video or playlist link, or a Spotify track link.")
        .setRequired(true)
        .setMaxLength(MAX_QUERY_LENGTH),
    );
}

/** Runs /play; tests pass their own resolvers to avoid calling YouTube and Spotify. */
export async function executePlay(
  interaction: ChatInputCommandInteraction,
  musicManager: MusicManager,
  resolvers: Pick<TrackResolverRegistry, "find"> = trackResolvers,
): Promise<void> {
  const guild = interaction.guild;

  if (!interaction.inGuild() || !guild) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!(await requireMusicChannel(interaction, guild))) {
    return;
  }

  const voiceChannel = guild.voiceStates.cache.get(interaction.user.id)?.channel;

  if (!voiceChannel) {
    await interaction.reply({
      content: "Join a voice channel before using this command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const botPermissions = guild.members.me && voiceChannel.permissionsFor(guild.members.me);

  if (
    !botPermissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]) ||
    !voiceChannel.joinable
  ) {
    await interaction.reply({
      content: "I don't have permission to join and speak in your voice channel.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const botChannelId = musicManager.getVoiceChannelId(guild.id);

  if (botChannelId && botChannelId !== voiceChannel.id) {
    await interaction.reply({
      content: "I'm already playing in another voice channel. Join it to add tracks.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const match = resolvers.find(interaction.options.getString("query", true));

  if ("reason" in match) {
    await interaction.reply({
      content: match.reason,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const { resolver, query } = match;
  await interaction.deferReply();

  let tracks;
  try {
    tracks = await resolver.resolve(query, interaction.user.id);
  } catch (error) {
    if (error instanceof UnsupportedTrackError) {
      logger.warn("Track rejected", { query, reason: error.message });
    } else {
      logger.error("Failed to resolve track", { query }, error);
    }
    await interaction.editReply(error instanceof UnsupportedTrackError ? error.message : resolver.failureMessage);
    return;
  }

  const [track] = tracks;

  if (!track) {
    await interaction.editReply("Nothing to play was found for that request.");
    return;
  }

  const textChannel = interaction.channel;
  const notify = (message: string | MessageCreateOptions) => {
    if (textChannel?.isSendable()) {
      textChannel.send(message).catch((error) => logger.error("Failed to send notification", { channel: textChannel.id }, error));
    } else {
      logger.warn("Cannot send notifications to this channel", { channel: interaction.channelId });
    }
  };

  let result;
  try {
    result = await musicManager.enqueue(voiceChannel, track, notify);
    for (const extra of tracks.slice(1)) {
      await musicManager.enqueue(voiceChannel, extra, notify);
    }
  } catch (error) {
    logger.error("Failed to start playback", { guild: guild.id, voiceChannel: voiceChannel.name, track: track.title }, error);
    await interaction.editReply("Could not connect to the voice channel. Try again.");
    return;
  }

  logger.info("Track queued", { guild: guild.name, track: track.title, url: track.url, count: tracks.length, ...result });

  const label = `**${track.title}** (${formatDuration(track.durationSeconds)})`;

  if (tracks.length === 1) {
    await interaction.editReply(
      result.startedPlaying
        ? `Added to the queue: ${label} — starting now.`
        : `Added to the queue at position ${result.position}: ${label}`,
    );
    return;
  }

  const total = formatDuration(tracks.reduce((sum, queued) => sum + queued.durationSeconds, 0));
  const added = `Added ${tracks.length} tracks to the queue (${total})`;
  await interaction.editReply(
    result.startedPlaying
      ? `${added} — starting now with ${label}.`
      : `${added} from position ${result.position}, starting with ${label}.`,
  );
}

export const playCommand: BotCommand = {
  data: buildPlayCommand("play"),
  execute: executePlay,
};

export const playAliasCommand: BotCommand = {
  data: buildPlayCommand("p"),
  execute: executePlay,
};

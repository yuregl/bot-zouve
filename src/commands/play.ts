import { getVoiceConnection } from "@discordjs/voice";
import {
  type ChatInputCommandInteraction,
  type MessageCreateOptions,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./command.js";
import { createLogger } from "../logger.js";
import type { MusicManager } from "../music/music-manager.js";
import { formatDuration } from "../music/track.js";
import { requireMusicChannel } from "./require-music-channel.js";
import { isYouTubeUrl, resolveYouTubeTrack, UnsupportedTrackError } from "../music/youtube.js";

const logger = createLogger("play");

function buildPlayCommand(name: string) {
  return new SlashCommandBuilder()
    .setName(name)
    .setDescription("Plays a YouTube link or adds it to the queue.")
    .addStringOption((option) =>
      option.setName("query").setDescription("YouTube video link.").setRequired(true),
    );
}

async function executePlay(
  interaction: ChatInputCommandInteraction,
  musicManager: MusicManager,
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

  const botChannelId = getVoiceConnection(guild.id)?.joinConfig.channelId;

  if (botChannelId && botChannelId !== voiceChannel.id) {
    await interaction.reply({
      content: "I'm already playing in another voice channel. Join it to add tracks.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const query = interaction.options.getString("query", true).trim();

  if (!isYouTubeUrl(query)) {
    await interaction.reply({
      content: "Send a valid YouTube video link. Searching by name is not supported yet.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  let track;
  try {
    track = await resolveYouTubeTrack(query, interaction.user.id);
  } catch (error) {
    if (error instanceof UnsupportedTrackError) {
      logger.warn("Track rejected", { query, reason: error.message });
    } else {
      logger.error("Failed to load YouTube track", { query }, error);
    }
    await interaction.editReply(
      error instanceof UnsupportedTrackError
        ? error.message
        : "Could not load this video. Check that the link is public and available.",
    );
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
  } catch (error) {
    logger.error("Failed to start playback", { guild: guild.id, voiceChannel: voiceChannel.name, track: track.title }, error);
    await interaction.editReply("Could not connect to the voice channel. Try again.");
    return;
  }

  logger.info("Track queued", { guild: guild.name, track: track.title, url: track.url, ...result });

  const label = `**${track.title}** (${formatDuration(track.durationSeconds)})`;
  await interaction.editReply(
    result.startedPlaying
      ? `Added to the queue: ${label} — starting now.`
      : `Added to the queue at position ${result.position}: ${label}`,
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

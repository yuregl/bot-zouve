import {
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./command.js";
import { createLogger } from "../infra/logger.js";
import { formatDuration, parseTimestamp } from "../music/track.js";
import { requireMusicChannel } from "./require-music-channel.js";

const logger = createLogger("seek");

export const seekCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("seek")
    .setDescription("Jumps to a position in the current track.")
    .addStringOption((option) =>
      option
        .setName("time")
        .setDescription("Position as shown on YouTube, like 2:13 or 1:02:30.")
        .setRequired(true)
        .setMaxLength(12),
    ),
  async execute(interaction, musicManager) {
    const guild = interaction.guild;
    const guildId = interaction.guildId;

    if (!interaction.inGuild() || !guild || !guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!(await requireMusicChannel(interaction, guild))) {
      return;
    }

    const position = parseTimestamp(interaction.options.getString("time", true));

    if (position === undefined) {
      await interaction.reply({
        content: "Send the time as minutes and seconds, like `2:13`, or with hours, like `1:02:30`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const botVoiceChannelId = musicManager.getVoiceChannelId(guildId);

    if (!botVoiceChannelId) {
      await interaction.reply({
        content: "There is no music playing right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const memberVoiceChannelId = guild.voiceStates.cache.get(interaction.user.id)?.channelId;

    if (memberVoiceChannelId !== botVoiceChannelId) {
      await interaction.reply({
        content: "Join the same voice channel as the bot to change the position.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const outcome = musicManager.seek(guildId, position);

    if (outcome.status === "not-playing") {
      await interaction.reply({
        content: "There is no music playing right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (outcome.status === "out-of-range") {
      await interaction.reply({
        content: `**${outcome.track.title}** is only ${formatDuration(outcome.track.durationSeconds)} long.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const label = position > 0 ? formatDuration(position) : "0:00";
    logger.info("Seek requested", { guild: guild.name, user: interaction.user.tag, position: label });
    await interaction.reply(`Jumped to ${label} in **${outcome.track.title}**.`);
  },
};

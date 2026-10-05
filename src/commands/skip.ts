import {
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./command.js";
import { createLogger } from "../infra/logger.js";
import { requireMusicChannel } from "./require-music-channel.js";

const logger = createLogger("skip");

export const skipCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("skip")
    .setDescription("Skips the current track and plays the next one in the queue."),
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
        content: "Join the same voice channel as the bot to skip tracks.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = musicManager.skip(guildId);

    if (!result) {
      await interaction.reply({
        content: "There is no music playing right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    logger.info("Track skipped", { guild: guild.name, user: interaction.user.tag, track: result.skipped.title });
    await interaction.reply(
      result.next
        ? `Skipped **${result.skipped.title}**. Up next: **${result.next.title}**.`
        : `Skipped **${result.skipped.title}**. The queue is now empty.`,
    );
  },
};

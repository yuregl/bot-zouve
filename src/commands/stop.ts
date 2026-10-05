import {
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./command.js";
import { createLogger } from "../logger.js";
import { requireMusicChannel } from "./require-music-channel.js";

const logger = createLogger("stop");

export const stopCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stops the current track and clears the queue."),
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
        content: "Join the same voice channel as the bot to stop playback.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!musicManager.stop(guildId)) {
      await interaction.reply({
        content: "There is no music playing right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    logger.info("Playback stopped", { guild: guild.name, user: interaction.user.tag });
    await interaction.reply("Stopped playback and cleared the queue.");
  },
};

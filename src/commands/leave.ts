import {
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./command.js";
import { createLogger } from "../logger.js";
import { requireMusicChannel } from "./require-music-channel.js";

const logger = createLogger("leave");

export const leaveCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Disconnects the bot from the voice channel and clears the queue."),
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
        content: "I'm not connected to a voice channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const memberVoiceChannelId = guild.voiceStates.cache.get(interaction.user.id)?.channelId;

    if (memberVoiceChannelId !== botVoiceChannelId) {
      await interaction.reply({
        content: "Join the same voice channel as the bot to disconnect it.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!musicManager.leave(guildId)) {
      await interaction.reply({
        content: "I'm not connected to a voice channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    logger.info("Left voice channel", { guild: guild.name, user: interaction.user.tag });
    await interaction.reply("Disconnected from the voice channel and cleared the queue.");
  },
};

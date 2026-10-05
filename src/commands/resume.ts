import {
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./command.js";
import { createLogger } from "../infra/logger.js";
import { requireMusicChannel } from "./require-music-channel.js";

const logger = createLogger("resume");

export const resumeCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resumes the paused track."),
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
    const queue = musicManager.getQueue(guildId);

    if (!botVoiceChannelId || !queue?.current) {
      await interaction.reply({
        content: "There is no music playing right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const memberVoiceChannelId = guild.voiceStates.cache.get(interaction.user.id)?.channelId;

    if (memberVoiceChannelId !== botVoiceChannelId) {
      await interaction.reply({
        content: "Join the same voice channel as the bot to resume playback.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!queue.paused) {
      await interaction.reply({
        content: "Playback is not paused.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!musicManager.resume(guildId)) {
      await interaction.reply({
        content: "Playback could not be resumed.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    logger.info("Playback resumed", { guild: guild.name, user: interaction.user.tag, track: queue.current.title });
    await interaction.reply(`Resumed **${queue.current.title}**.`);
  },
};

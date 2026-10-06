import {
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./command.js";
import { requireMusicChannel } from "./require-music-channel.js";

export const pauseCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pauses the current track."),
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

    const memberVoiceChannelId = guild.voiceStates.cache.get(interaction.user.id)?.channelId;

    if (!memberVoiceChannelId) {
      await interaction.reply({
        content: "Join a voice channel before using this command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const queue = musicManager.getQueue(guildId);

    if (!queue?.current || queue.paused) {
      await interaction.reply({
        content: "There is no music playing right now.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (musicManager.getVoiceChannelId(guildId) !== memberVoiceChannelId) {
      await interaction.reply({
        content: "Join the same voice channel as the bot to pause playback.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!musicManager.pause(guildId)) {
      await interaction.reply({
        content: "Playback could not be paused.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply("Playback paused.");
  },
};

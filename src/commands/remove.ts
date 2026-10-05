import {
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./command.js";
import { createLogger } from "../infra/logger.js";
import { requireMusicChannel } from "./require-music-channel.js";

const logger = createLogger("remove");

export const removeCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Removes a track from the queue by its number in /queue.")
    .addIntegerOption((option) =>
      option
        .setName("position")
        .setDescription("The track's number under 'Up next' in /queue.")
        .setRequired(true)
        .setMinValue(1),
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

    const botVoiceChannelId = musicManager.getVoiceChannelId(guildId);

    if (!botVoiceChannelId) {
      await interaction.reply({
        content: "The queue is empty.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const memberVoiceChannelId = guild.voiceStates.cache.get(interaction.user.id)?.channelId;

    if (memberVoiceChannelId !== botVoiceChannelId) {
      await interaction.reply({
        content: "Join the same voice channel as the bot to change the queue.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const position = interaction.options.getInteger("position", true);
    const outcome = musicManager.remove(guildId, position);

    if (outcome.status === "empty") {
      await interaction.reply({
        content: "The queue is empty. To end the current track, use `/skip`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (outcome.status === "out-of-range") {
      await interaction.reply({
        content: `There is no track ${position} in the queue; it has ${outcome.size} ${outcome.size === 1 ? "track" : "tracks"}. Use \`/queue\` to see the numbers.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    logger.info("Remove requested", { guild: guild.name, user: interaction.user.tag, position, track: outcome.track.title });
    await interaction.reply(`Removed **${outcome.track.title}** from the queue.`);
  },
};

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
    .setDescription("Removes a track, or a range of tracks, from the queue by their numbers in /queue.")
    .addIntegerOption((option) =>
      option
        .setName("start")
        .setDescription("The number under 'Up next' in /queue of the first track to remove.")
        .setRequired(true)
        .setMinValue(1),
    )
    .addIntegerOption((option) =>
      option
        .setName("end")
        .setDescription("The number of the last track to remove; leave empty to remove only one track.")
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

    const start = interaction.options.getInteger("start", true);
    const end = interaction.options.getInteger("end") ?? start;
    const outcome = musicManager.remove(guildId, start, end);

    if (outcome.status === "empty") {
      await interaction.reply({
        content: "The queue is empty. To end the current track, use `/skip`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (outcome.status === "out-of-range") {
      const size = `${outcome.size} ${outcome.size === 1 ? "track" : "tracks"}`;
      let content: string;
      if (end < start) {
        content = `The end (${end}) must not come before the start (${start}).`;
      } else if (start === end) {
        content = `There is no track ${start} in the queue; it has ${size}. Use \`/queue\` to see the numbers.`;
      } else {
        content = `Tracks ${start} to ${end} are not all in the queue; it has ${size}. Use \`/queue\` to see the numbers.`;
      }
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
      return;
    }

    const [first] = outcome.tracks;
    logger.info("Remove requested", { guild: guild.name, user: interaction.user.tag, start, end, count: outcome.tracks.length });
    await interaction.reply(
      outcome.tracks.length === 1 && first
        ? `Removed **${first.title}** from the queue.`
        : `Removed ${outcome.tracks.length} tracks (${start} to ${end}) from the queue.`,
    );
  },
};

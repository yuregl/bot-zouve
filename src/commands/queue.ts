import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./command.js";
import type { QueueSnapshot } from "../music/music-manager.js";
import { formatDuration, type Track } from "../music/track.js";
import { requireMusicChannel } from "./require-music-channel.js";

export const QUEUE_PAGE_SIZE = 10;

function formatTrack(track: Track, elapsedSeconds?: number): string {
  // formatDuration shows 0 seconds as unknown, so the very start of a track reads 0:00.
  const elapsed = elapsedSeconds === undefined ? "" : `${elapsedSeconds >= 1 ? formatDuration(elapsedSeconds) : "0:00"} / `;
  return `[${track.title}](${track.url}) (${elapsed}${formatDuration(track.durationSeconds)}) — <@${track.requestedBy}>`;
}

export function buildQueueEmbed(queue: QueueSnapshot): EmbedBuilder {
  const lines: string[] = [];

  if (queue.current) {
    lines.push(queue.paused ? "**Paused**" : "**Now playing**", `${queue.paused ? "⏸" : "▶"} ${formatTrack(queue.current, queue.elapsedSeconds)}`);
  }

  if (queue.upcoming.length > 0) {
    if (lines.length > 0) {
      lines.push("");
    }
    lines.push("**Up next**");
    queue.upcoming
      .slice(0, QUEUE_PAGE_SIZE)
      .forEach((track, index) => lines.push(`${index + 1}. ${formatTrack(track)}`));

    const remaining = queue.upcoming.length - QUEUE_PAGE_SIZE;
    if (remaining > 0) {
      lines.push(`…and ${remaining} more ${remaining === 1 ? "track" : "tracks"}`);
    }
  }

  const tracks = queue.current ? [queue.current, ...queue.upcoming] : queue.upcoming;
  const totalSeconds = tracks.reduce((total, track) => total + track.durationSeconds, 0);

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Queue")
    .setDescription(lines.join("\n"))
    .setFooter({
      text: `${tracks.length} ${tracks.length === 1 ? "track" : "tracks"} · ${formatDuration(totalSeconds)} total`,
    });
}

export const queueCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Shows the current track and the tracks waiting in the queue."),
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

    const queue = musicManager.getQueue(guildId);

    if (!queue || (!queue.current && queue.upcoming.length === 0)) {
      await interaction.reply({
        content: "The queue is empty. Use `/play` to add a track.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({ embeds: [buildQueueEmbed(queue)] });
  },
};

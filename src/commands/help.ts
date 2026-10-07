import {
  EmbedBuilder,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./command.js";

export const helpCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Shows the bot's commands and what they do."),
  async execute(interaction) {
    const helpMessage = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Music Bot Help")
      .setDescription(
        [
          "Hello! Here are the commands for controlling music on this server.",
          "Music commands only work in the #zouve-music channel.",
          "",
          "`/help` — shows this help message.",
          "`/setup` — creates the #zouve-music channel (requires Manage Channels).",
          "`/p <query>` or `/play <query>` — plays the first YouTube result for a song name, a YouTube video or playlist link, or a Spotify track link, or adds it to the queue.",
          "`/pause` — pauses the current track when playback is active.",
          "`/resume` — resumes the paused track.",
          "`/seek <time>` — jumps to a position in the current track, like `2:13` or `1:02:30`.",
          "`/skip` — skips the current track; for a track someone else requested, opens a vote that needs more than half of the voice channel.",
          "`/stop` — stops the current track and clears the queue; the bot stays in the voice channel until it has been idle for a while.",
          "`/leave` — disconnects the bot from the voice channel and clears the queue.",
          "`/queue` — shows the current track and the next tracks in the queue.",
          "`/remove <start> [end]` — removes a track, or the tracks from `start` to `end`, by their numbers in `/queue`.",
        ].join("\n"),
      )
      .setFooter({ text: "YouTube playlists and Mixes add up to 50 tracks; live streams are not supported." });

    await interaction.reply({ embeds: [helpMessage] });
  },
};

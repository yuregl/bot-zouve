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
          "Hello! Here are the planned commands for controlling music on this server.",
          "Music commands only work in the #zouve-music channel.",
          "",
          "**Available now**",
          "`/help` — shows this help message.",
          "`/setup` — creates the #zouve-music channel (requires Manage Channels).",
          "`/p <query>` or `/play <query>` — plays a YouTube video link or the first YouTube result for a song name, or adds it to the queue.",
          "`/pause` — pauses the current track when playback is active.",
          "`/skip` — skips the current track and plays the next one in the queue.",
          "`/stop` — stops the current track and clears the queue; the bot stays in the voice channel.",
          "`/leave` — disconnects the bot from the voice channel and clears the queue.",
          "`/queue` — shows the current track and the next tracks in the queue.",
          "",
          "**In development — not available yet**",
          "`/resume` — resumes the paused track.",
          "`/nowplaying` — shows the current track.",
          "`/volume <value>` — adjusts the volume.",
          "`/loop <mode>` — controls repeat for the current track or the queue.",
        ].join("\n"),
      )
      .setFooter({ text: "Only YouTube is supported; playlists and live streams are not available yet." });

    await interaction.reply({ embeds: [helpMessage] });
  },
};

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
          "",
          "**Available now**",
          "`/help` — shows this help message.",
          "",
          "**In development — not available yet**",
          "`/play <query>` — searches for and plays a track or adds it to the queue.",
          "`/pause` — pauses the current track.",
          "`/resume` — resumes the paused track.",
          "`/skip` — skips to the next track in the queue.",
          "`/stop` — stops playback and clears the queue.",
          "`/queue` — shows the tracks waiting in the queue.",
          "`/nowplaying` — shows the current track.",
          "`/volume <value>` — adjusts the volume.",
          "`/loop <mode>` — controls repeat for the current track or the queue.",
        ].join("\n"),
      )
      .setFooter({ text: "Music commands will be available in future updates." });

    await interaction.reply({ embeds: [helpMessage] });
  },
};

import {
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "./command.js";
import { createLogger } from "../logger.js";
import { findMusicChannel, MUSIC_CHANNEL_NAME } from "../music/music-channel.js";

const logger = createLogger("setup");

export const setupCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("setup")
    .setDescription("Creates the text channel where music commands are used.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setContexts(InteractionContextType.Guild),
  async execute(interaction) {
    const guild = interaction.guild;

    if (!interaction.inGuild() || !guild) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: "You need the Manage Channels permission to use this command.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const existing = findMusicChannel(guild);

    if (existing) {
      await interaction.reply({
        content: `The music channel already exists: ${existing}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const botMember = guild.members.me;

    if (!botMember?.permissions.has(PermissionFlagsBits.ManageChannels)) {
      logger.warn("Missing Manage Channels permission", { guild: guild.name });
      await interaction.reply({
        content: "I need the Manage Channels permission to create the music channel.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let channel;
    try {
      channel = await guild.channels.create({
        name: MUSIC_CHANNEL_NAME,
        type: ChannelType.GuildText,
        topic: "Use /play here to queue music. The bot posts what is playing in this channel.",
        reason: `/setup run by ${interaction.user.tag}`,
      });
    } catch (error) {
      logger.error("Failed to create the music channel", { guild: guild.name }, error);
      await interaction.reply({
        content: "Could not create the music channel. Check my permissions and try again.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    logger.info("Music channel created", { guild: guild.name, channel: channel.id });

    const canPost = channel
      .permissionsFor(botMember)
      .has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);

    await interaction.reply(
      canPost
        ? `Music channel created: ${channel}. Use \`/play\` there.`
        : `Music channel created: ${channel}, but I can't send messages or embeds there. Give me View Channel, Send Messages, and Embed Links in it.`,
    );
  },
};

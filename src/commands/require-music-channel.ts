import { MessageFlags, type ChatInputCommandInteraction, type Guild } from "discord.js";
import { findMusicChannel, MUSIC_CHANNEL_NAME } from "../music/music-channel.js";

/**
 * Replies with guidance and returns false when the interaction was not sent
 * from the server's music channel.
 */
export async function requireMusicChannel(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
): Promise<boolean> {
  const musicChannel = findMusicChannel(guild);

  if (!musicChannel) {
    await interaction.reply({
      content: `This server has no #${MUSIC_CHANNEL_NAME} channel yet. Ask an admin to run \`/setup\`.`,
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  if (interaction.channelId !== musicChannel.id) {
    await interaction.reply({
      content: `Music commands only work in ${musicChannel}.`,
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  return true;
}

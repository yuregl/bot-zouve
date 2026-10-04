import { ChannelType, type Guild, type TextChannel } from "discord.js";

export const MUSIC_CHANNEL_NAME = "zouve-music";

export function findMusicChannel(guild: Pick<Guild, "channels">): TextChannel | undefined {
  return guild.channels.cache.find(
    (channel): channel is TextChannel =>
      channel.type === ChannelType.GuildText && channel.name === MUSIC_CHANNEL_NAME,
  );
}

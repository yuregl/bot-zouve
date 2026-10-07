import { type Client, Events, type Guild } from "discord.js";
import type { MusicManager } from "./music-manager.js";

/** People in the voice channel, not counting bots (including this one). */
export function countListeners(guild: Guild, channelId: string): number {
  return guild.voiceStates.cache.filter((state) => state.channelId === channelId && !state.member?.user.bot).size;
}

/** Tells the music manager how many people are in the bot's voice channel whenever someone joins or leaves it. */
export function watchVoicePresence(
  client: Client,
  musicManager: Pick<MusicManager, "getVoiceChannelId" | "updateListeners">,
): void {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const guild = newState.guild;
    const channelId = musicManager.getVoiceChannelId(guild.id);

    if (!channelId || (oldState.channelId !== channelId && newState.channelId !== channelId)) {
      return;
    }

    musicManager.updateListeners(guild.id, countListeners(guild, channelId));
  });
}

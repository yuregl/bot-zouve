import assert from "node:assert/strict";
import { test } from "node:test";
import { ChannelType, Collection, type Guild } from "discord.js";
import { findMusicChannel, MUSIC_CHANNEL_NAME } from "./music-channel.js";

function fakeGuild(channels: { id: string; name: string; type: ChannelType }[]) {
  const cache = new Collection(channels.map((channel) => [channel.id, channel]));
  return { channels: { cache } } as unknown as Pick<Guild, "channels">;
}

test("findMusicChannel finds the text channel by name", () => {
  const guild = fakeGuild([
    { id: "1", name: "general", type: ChannelType.GuildText },
    { id: "2", name: MUSIC_CHANNEL_NAME, type: ChannelType.GuildText },
  ]);

  assert.equal(findMusicChannel(guild)?.id, "2");
});

test("findMusicChannel ignores non-text channels with the same name", () => {
  const guild = fakeGuild([{ id: "1", name: MUSIC_CHANNEL_NAME, type: ChannelType.GuildVoice }]);

  assert.equal(findMusicChannel(guild), undefined);
});

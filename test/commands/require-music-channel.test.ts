import assert from "node:assert/strict";
import { test } from "node:test";
import { ChannelType, Collection, MessageFlags, type ChatInputCommandInteraction, type Guild, type InteractionReplyOptions } from "discord.js";
import { requireMusicChannel } from "../../src/commands/require-music-channel.js";
import { MUSIC_CHANNEL_NAME } from "../../src/music/music-channel.js";

function setup(options: { channelExists: boolean; channelId: string }) {
  const replies: InteractionReplyOptions[] = [];
  const guild = {
    channels: {
      cache: new Collection(
        options.channelExists
          ? [["music", { id: "music", name: MUSIC_CHANNEL_NAME, type: ChannelType.GuildText, toString: () => "<#music>" }]]
          : [],
      ),
    },
  } as unknown as Guild;
  const interaction = {
    channelId: options.channelId,
    reply: async (response: InteractionReplyOptions) => {
      replies.push(response);
    },
  } as unknown as ChatInputCommandInteraction;
  return { check: () => requireMusicChannel(interaction, guild), replies };
}

test("requireMusicChannel accepts commands sent in the music channel", async () => {
  const { check, replies } = setup({ channelExists: true, channelId: "music" });

  assert.equal(await check(), true);
  assert.deepEqual(replies, []);
});

test("requireMusicChannel points to the music channel from other channels", async () => {
  const { check, replies } = setup({ channelExists: true, channelId: "general" });

  assert.equal(await check(), false);
  assert.deepEqual(replies, [{ content: "Music commands only work in <#music>.", flags: MessageFlags.Ephemeral }]);
});

test("requireMusicChannel asks for /setup when the server has no music channel", async () => {
  const { check, replies } = setup({ channelExists: false, channelId: "general" });

  assert.equal(await check(), false);
  assert.match(String(replies[0]?.content), /no #zouve-music channel yet.*\/setup/);
  assert.equal(replies[0]?.flags, MessageFlags.Ephemeral);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { ChannelType, Collection, MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";
import { leaveCommand } from "../../src/commands/leave.js";
import type { MusicManager } from "../../src/music/music-manager.js";
import { MUSIC_CHANNEL_NAME } from "../../src/music/music-channel.js";

const MUSIC_CHANNEL_ID = "music";
const BOT_VOICE_CHANNEL_ID = "voice-1";

function setup(options: { channelId?: string; memberVoiceChannelId?: string; botVoiceChannelId?: string }) {
  const replies: (string | InteractionReplyOptions)[] = [];
  const leaveCalls: string[] = [];

  const guild = {
    name: "Test guild",
    channels: {
      cache: new Collection([
        [MUSIC_CHANNEL_ID, { id: MUSIC_CHANNEL_ID, name: MUSIC_CHANNEL_NAME, type: ChannelType.GuildText }],
      ]),
    },
    voiceStates: {
      cache: new Collection(
        options.memberVoiceChannelId ? [["user", { channelId: options.memberVoiceChannelId }]] : [],
      ),
    },
  };

  const interaction = {
    guild,
    guildId: "guild",
    channelId: options.channelId ?? MUSIC_CHANNEL_ID,
    user: { id: "user", tag: "user#0001" },
    inGuild: () => true,
    reply: async (response: string | InteractionReplyOptions) => {
      replies.push(response);
    },
  } as unknown as ChatInputCommandInteraction;

  const musicManager = {
    getVoiceChannelId: () => options.botVoiceChannelId,
    leave: (guildId: string) => {
      leaveCalls.push(guildId);
      return true;
    },
  } as unknown as MusicManager;

  return { interaction, musicManager, replies, leaveCalls };
}

function isEphemeral(response: string | InteractionReplyOptions | undefined): boolean {
  return typeof response === "object" && response.flags === MessageFlags.Ephemeral;
}

test("/leave disconnects when the member is in the bot's voice channel", async () => {
  const { interaction, musicManager, replies, leaveCalls } = setup({
    memberVoiceChannelId: BOT_VOICE_CHANNEL_ID,
    botVoiceChannelId: BOT_VOICE_CHANNEL_ID,
  });

  await leaveCommand.execute(interaction, musicManager);

  assert.deepEqual(leaveCalls, ["guild"]);
  assert.equal(replies.length, 1);
  assert.equal(isEphemeral(replies[0]), false);
});

test("/leave refuses when the bot is not connected", async () => {
  const { interaction, musicManager, replies, leaveCalls } = setup({ memberVoiceChannelId: BOT_VOICE_CHANNEL_ID });

  await leaveCommand.execute(interaction, musicManager);

  assert.deepEqual(leaveCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/leave refuses when the member is in another voice channel", async () => {
  const { interaction, musicManager, replies, leaveCalls } = setup({
    memberVoiceChannelId: "voice-2",
    botVoiceChannelId: BOT_VOICE_CHANNEL_ID,
  });

  await leaveCommand.execute(interaction, musicManager);

  assert.deepEqual(leaveCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/leave refuses when the member is not in a voice channel", async () => {
  const { interaction, musicManager, replies, leaveCalls } = setup({ botVoiceChannelId: BOT_VOICE_CHANNEL_ID });

  await leaveCommand.execute(interaction, musicManager);

  assert.deepEqual(leaveCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/leave refuses outside the music channel", async () => {
  const { interaction, musicManager, replies, leaveCalls } = setup({
    channelId: "general",
    memberVoiceChannelId: BOT_VOICE_CHANNEL_ID,
    botVoiceChannelId: BOT_VOICE_CHANNEL_ID,
  });

  await leaveCommand.execute(interaction, musicManager);

  assert.deepEqual(leaveCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

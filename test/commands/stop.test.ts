import assert from "node:assert/strict";
import { test } from "node:test";
import { ChannelType, Collection, MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";
import { stopCommand } from "../../src/commands/stop.js";
import type { MusicManager } from "../../src/music/music-manager.js";
import { MUSIC_CHANNEL_NAME } from "../../src/music/music-channel.js";

const MUSIC_CHANNEL_ID = "music";
const BOT_VOICE_CHANNEL_ID = "voice-1";

function setup(options: {
  channelId?: string;
  memberVoiceChannelId?: string;
  botVoiceChannelId?: string;
  isPlaying?: boolean;
}) {
  const replies: (string | InteractionReplyOptions)[] = [];
  const stopCalls: string[] = [];
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
    stop: (guildId: string) => {
      stopCalls.push(guildId);
      return options.isPlaying ?? true;
    },
    leave: (guildId: string) => {
      leaveCalls.push(guildId);
      return true;
    },
  } as unknown as MusicManager;

  return { interaction, musicManager, replies, stopCalls, leaveCalls };
}

function isEphemeral(response: string | InteractionReplyOptions | undefined): boolean {
  return typeof response === "object" && response.flags === MessageFlags.Ephemeral;
}

test("/stop stops playback without leaving the voice channel", async () => {
  const { interaction, musicManager, replies, stopCalls, leaveCalls } = setup({
    memberVoiceChannelId: BOT_VOICE_CHANNEL_ID,
    botVoiceChannelId: BOT_VOICE_CHANNEL_ID,
  });

  await stopCommand.execute(interaction, musicManager);

  assert.deepEqual(stopCalls, ["guild"]);
  assert.deepEqual(leaveCalls, []);
  assert.equal(replies.length, 1);
  assert.equal(isEphemeral(replies[0]), false);
});

test("/stop refuses when nothing is playing", async () => {
  const { interaction, musicManager, replies } = setup({
    memberVoiceChannelId: BOT_VOICE_CHANNEL_ID,
    botVoiceChannelId: BOT_VOICE_CHANNEL_ID,
    isPlaying: false,
  });

  await stopCommand.execute(interaction, musicManager);

  assert.ok(isEphemeral(replies[0]));
});

test("/stop refuses when the bot is not connected", async () => {
  const { interaction, musicManager, replies, stopCalls } = setup({ memberVoiceChannelId: BOT_VOICE_CHANNEL_ID });

  await stopCommand.execute(interaction, musicManager);

  assert.deepEqual(stopCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/stop refuses when the member is in another voice channel", async () => {
  const { interaction, musicManager, replies, stopCalls } = setup({
    memberVoiceChannelId: "voice-2",
    botVoiceChannelId: BOT_VOICE_CHANNEL_ID,
  });

  await stopCommand.execute(interaction, musicManager);

  assert.deepEqual(stopCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/stop refuses outside the music channel", async () => {
  const { interaction, musicManager, replies, stopCalls } = setup({
    channelId: "general",
    memberVoiceChannelId: BOT_VOICE_CHANNEL_ID,
    botVoiceChannelId: BOT_VOICE_CHANNEL_ID,
  });

  await stopCommand.execute(interaction, musicManager);

  assert.deepEqual(stopCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

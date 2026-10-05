import assert from "node:assert/strict";
import { test } from "node:test";
import { ChannelType, Collection, MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";
import { skipCommand } from "../../src/commands/skip.js";
import type { MusicManager, SkipResult } from "../../src/music/music-manager.js";
import { MUSIC_CHANNEL_NAME } from "../../src/music/music-channel.js";
import type { Track } from "../../src/music/track.js";

const MUSIC_CHANNEL_ID = "music";
const BOT_VOICE_CHANNEL_ID = "voice-1";

function track(title: string): Track {
  return { title, url: `https://www.youtube.com/watch?v=${title}`, durationSeconds: 60, requestedBy: "user" };
}

function setup(options: {
  channelId?: string;
  memberVoiceChannelId?: string;
  botVoiceChannelId?: string;
  skipResult?: SkipResult;
}) {
  const replies: (string | InteractionReplyOptions)[] = [];
  const skipCalls: string[] = [];

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
    skip: (guildId: string) => {
      skipCalls.push(guildId);
      return options.skipResult;
    },
  } as unknown as MusicManager;

  return { interaction, musicManager, replies, skipCalls };
}

function isEphemeral(response: string | InteractionReplyOptions | undefined): boolean {
  return typeof response === "object" && response.flags === MessageFlags.Ephemeral;
}

const inBotChannel = { memberVoiceChannelId: BOT_VOICE_CHANNEL_ID, botVoiceChannelId: BOT_VOICE_CHANNEL_ID };

test("/skip announces the skipped and the next track", async () => {
  const { interaction, musicManager, replies, skipCalls } = setup({
    ...inBotChannel,
    skipResult: { skipped: track("A"), next: track("B") },
  });

  await skipCommand.execute(interaction, musicManager);

  assert.deepEqual(skipCalls, ["guild"]);
  assert.equal(replies[0], "Skipped **A**. Up next: **B**.");
});

test("/skip says when the queue is now empty", async () => {
  const { interaction, musicManager, replies } = setup({ ...inBotChannel, skipResult: { skipped: track("A") } });

  await skipCommand.execute(interaction, musicManager);

  assert.equal(replies[0], "Skipped **A**. The queue is now empty.");
});

test("/skip refuses when nothing is playing", async () => {
  const { interaction, musicManager, replies } = setup(inBotChannel);

  await skipCommand.execute(interaction, musicManager);

  assert.ok(isEphemeral(replies[0]));
});

test("/skip refuses when the bot is not connected", async () => {
  const { interaction, musicManager, replies, skipCalls } = setup({ memberVoiceChannelId: BOT_VOICE_CHANNEL_ID });

  await skipCommand.execute(interaction, musicManager);

  assert.deepEqual(skipCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/skip refuses when the member is in another voice channel", async () => {
  const { interaction, musicManager, replies, skipCalls } = setup({
    memberVoiceChannelId: "voice-2",
    botVoiceChannelId: BOT_VOICE_CHANNEL_ID,
  });

  await skipCommand.execute(interaction, musicManager);

  assert.deepEqual(skipCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/skip refuses outside the music channel", async () => {
  const { interaction, musicManager, replies, skipCalls } = setup({ ...inBotChannel, channelId: "general" });

  await skipCommand.execute(interaction, musicManager);

  assert.deepEqual(skipCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

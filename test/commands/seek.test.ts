import assert from "node:assert/strict";
import { test } from "node:test";
import { ChannelType, Collection, MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";
import { seekCommand } from "../../src/commands/seek.js";
import type { MusicManager, SeekOutcome } from "../../src/music/music-manager.js";
import { MUSIC_CHANNEL_NAME } from "../../src/music/music-channel.js";
import type { Track } from "../../src/music/track.js";

const MUSIC_CHANNEL_ID = "music";
const BOT_VOICE_CHANNEL_ID = "voice-1";

const TRACK: Track = { title: "Numb", url: "https://www.youtube.com/watch?v=A", durationSeconds: 185, requestedBy: "user" };

function setup(options: {
  time: string;
  channelId?: string;
  memberVoiceChannelId?: string;
  botVoiceChannelId?: string;
  outcome?: SeekOutcome;
}) {
  const replies: (string | InteractionReplyOptions)[] = [];
  const seekCalls: number[] = [];

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
    options: { getString: () => options.time },
    reply: async (response: string | InteractionReplyOptions) => {
      replies.push(response);
    },
  } as unknown as ChatInputCommandInteraction;

  const musicManager = {
    getVoiceChannelId: () => options.botVoiceChannelId,
    seek: (_guildId: string, position: number) => {
      seekCalls.push(position);
      return options.outcome ?? { status: "seeked", track: TRACK };
    },
  } as unknown as MusicManager;

  return { interaction, musicManager, replies, seekCalls };
}

function isEphemeral(response: string | InteractionReplyOptions | undefined): boolean {
  return typeof response === "object" && response.flags === MessageFlags.Ephemeral;
}

const inBotChannel = { memberVoiceChannelId: BOT_VOICE_CHANNEL_ID, botVoiceChannelId: BOT_VOICE_CHANNEL_ID };

test("/seek jumps to the position written as minutes and seconds", async () => {
  const { interaction, musicManager, replies, seekCalls } = setup({ ...inBotChannel, time: "2:13" });

  await seekCommand.execute(interaction, musicManager);

  assert.deepEqual(seekCalls, [133]);
  assert.equal(replies[0], "Jumped to 2:13 in **Numb**.");
});

test("/seek back to the start reads 0:00", async () => {
  const { interaction, musicManager, replies, seekCalls } = setup({ ...inBotChannel, time: "0:00" });

  await seekCommand.execute(interaction, musicManager);

  assert.deepEqual(seekCalls, [0]);
  assert.equal(replies[0], "Jumped to 0:00 in **Numb**.");
});

test("/seek refuses plain seconds and malformed times", async () => {
  for (const time of ["133", "2:5", "abc"]) {
    const { interaction, musicManager, replies, seekCalls } = setup({ ...inBotChannel, time });

    await seekCommand.execute(interaction, musicManager);

    assert.deepEqual(seekCalls, [], time);
    assert.ok(isEphemeral(replies[0]), time);
  }
});

test("/seek refuses a position past the end of the track", async () => {
  const { interaction, musicManager, replies } = setup({
    ...inBotChannel,
    time: "4:00",
    outcome: { status: "out-of-range", track: TRACK },
  });

  await seekCommand.execute(interaction, musicManager);

  assert.ok(isEphemeral(replies[0]));
  assert.match(String((replies[0] as InteractionReplyOptions).content), /only 3:05 long/);
});

test("/seek refuses when nothing is playing", async () => {
  for (const options of [{ ...inBotChannel, outcome: { status: "not-playing" } as const }, { memberVoiceChannelId: BOT_VOICE_CHANNEL_ID }]) {
    const { interaction, musicManager, replies } = setup({ ...options, time: "1:00" });

    await seekCommand.execute(interaction, musicManager);

    assert.ok(isEphemeral(replies[0]));
  }
});

test("/seek refuses when the member is in another voice channel", async () => {
  const { interaction, musicManager, replies, seekCalls } = setup({
    time: "1:00",
    memberVoiceChannelId: "voice-2",
    botVoiceChannelId: BOT_VOICE_CHANNEL_ID,
  });

  await seekCommand.execute(interaction, musicManager);

  assert.deepEqual(seekCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/seek refuses outside the music channel", async () => {
  const { interaction, musicManager, replies, seekCalls } = setup({ ...inBotChannel, time: "1:00", channelId: "general" });

  await seekCommand.execute(interaction, musicManager);

  assert.deepEqual(seekCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

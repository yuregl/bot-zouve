import assert from "node:assert/strict";
import { test } from "node:test";
import { ChannelType, Collection, MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";
import { resumeCommand } from "../../src/commands/resume.js";
import type { MusicManager, QueueSnapshot } from "../../src/music/music-manager.js";
import { MUSIC_CHANNEL_NAME } from "../../src/music/music-channel.js";
import type { Track } from "../../src/music/track.js";

const MUSIC_CHANNEL_ID = "music";
const BOT_VOICE_CHANNEL_ID = "voice-1";

const TRACK: Track = { title: "A", url: "https://www.youtube.com/watch?v=A", durationSeconds: 60, requestedBy: "user" };

function setup(options: {
  channelId?: string;
  memberVoiceChannelId?: string;
  botVoiceChannelId?: string;
  queue?: QueueSnapshot;
  resumes?: boolean;
}) {
  const replies: (string | InteractionReplyOptions)[] = [];
  const resumeCalls: string[] = [];

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
    getQueue: () => options.queue,
    resume: (guildId: string) => {
      resumeCalls.push(guildId);
      return options.resumes ?? true;
    },
  } as unknown as MusicManager;

  return { interaction, musicManager, replies, resumeCalls };
}

function isEphemeral(response: string | InteractionReplyOptions | undefined): boolean {
  return typeof response === "object" && response.flags === MessageFlags.Ephemeral;
}

const pausedInBotChannel = {
  memberVoiceChannelId: BOT_VOICE_CHANNEL_ID,
  botVoiceChannelId: BOT_VOICE_CHANNEL_ID,
  queue: { current: TRACK, paused: true, upcoming: [] },
};

test("/resume resumes the paused track", async () => {
  const { interaction, musicManager, replies, resumeCalls } = setup(pausedInBotChannel);

  await resumeCommand.execute(interaction, musicManager);

  assert.deepEqual(resumeCalls, ["guild"]);
  assert.equal(replies[0], "Resumed **A**.");
});

test("/resume refuses when playback is not paused", async () => {
  const { interaction, musicManager, replies, resumeCalls } = setup({
    ...pausedInBotChannel,
    queue: { current: TRACK, paused: false, upcoming: [] },
  });

  await resumeCommand.execute(interaction, musicManager);

  assert.deepEqual(resumeCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/resume refuses when nothing is playing", async () => {
  for (const queue of [undefined, { paused: false, upcoming: [] }]) {
    const { interaction, musicManager, replies, resumeCalls } = setup({ ...pausedInBotChannel, queue });

    await resumeCommand.execute(interaction, musicManager);

    assert.deepEqual(resumeCalls, []);
    assert.ok(isEphemeral(replies[0]));
  }
});

test("/resume reports when the player refuses to resume", async () => {
  const { interaction, musicManager, replies } = setup({ ...pausedInBotChannel, resumes: false });

  await resumeCommand.execute(interaction, musicManager);

  assert.ok(isEphemeral(replies[0]));
});

test("/resume refuses when the member is in another voice channel", async () => {
  const { interaction, musicManager, replies, resumeCalls } = setup({
    ...pausedInBotChannel,
    memberVoiceChannelId: "voice-2",
  });

  await resumeCommand.execute(interaction, musicManager);

  assert.deepEqual(resumeCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/resume refuses outside the music channel", async () => {
  const { interaction, musicManager, replies, resumeCalls } = setup({ ...pausedInBotChannel, channelId: "general" });

  await resumeCommand.execute(interaction, musicManager);

  assert.deepEqual(resumeCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

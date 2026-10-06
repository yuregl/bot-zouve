import assert from "node:assert/strict";
import { test } from "node:test";
import { ChannelType, Collection, MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";
import { pauseCommand } from "../../src/commands/pause.js";
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
  pauses?: boolean;
}) {
  const replies: (string | InteractionReplyOptions)[] = [];
  const pauseCalls: string[] = [];

  const guild = {
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
    user: { id: "user" },
    inGuild: () => true,
    reply: async (response: string | InteractionReplyOptions) => {
      replies.push(response);
    },
  } as unknown as ChatInputCommandInteraction;

  const musicManager = {
    getVoiceChannelId: () => options.botVoiceChannelId,
    getQueue: () => options.queue,
    pause: (guildId: string) => {
      pauseCalls.push(guildId);
      return options.pauses ?? true;
    },
  } as unknown as MusicManager;

  return { interaction, musicManager, replies, pauseCalls };
}

function isEphemeral(response: string | InteractionReplyOptions | undefined): boolean {
  return typeof response === "object" && response.flags === MessageFlags.Ephemeral;
}

const playingInBotChannel = {
  memberVoiceChannelId: BOT_VOICE_CHANNEL_ID,
  botVoiceChannelId: BOT_VOICE_CHANNEL_ID,
  queue: { current: TRACK, paused: false, upcoming: [] },
};

test("/pause pauses the playing track", async () => {
  const { interaction, musicManager, replies, pauseCalls } = setup(playingInBotChannel);

  await pauseCommand.execute(interaction, musicManager);

  assert.deepEqual(pauseCalls, ["guild"]);
  assert.equal(replies[0], "Playback paused.");
});

test("/pause refuses when nothing is playing or the track is already paused", async () => {
  for (const queue of [undefined, { paused: false, upcoming: [] }, { current: TRACK, paused: true, upcoming: [] }]) {
    const { interaction, musicManager, replies, pauseCalls } = setup({ ...playingInBotChannel, queue });

    await pauseCommand.execute(interaction, musicManager);

    assert.deepEqual(pauseCalls, []);
    assert.ok(isEphemeral(replies[0]));
  }
});

test("/pause reports when the player refuses to pause", async () => {
  const { interaction, musicManager, replies } = setup({ ...playingInBotChannel, pauses: false });

  await pauseCommand.execute(interaction, musicManager);

  assert.ok(isEphemeral(replies[0]));
});

test("/pause refuses members outside the bot's voice channel", async () => {
  for (const memberVoiceChannelId of [undefined, "voice-2"]) {
    const { interaction, musicManager, replies, pauseCalls } = setup({ ...playingInBotChannel, memberVoiceChannelId });

    await pauseCommand.execute(interaction, musicManager);

    assert.deepEqual(pauseCalls, []);
    assert.ok(isEphemeral(replies[0]));
  }
});

test("/pause refuses outside the music channel", async () => {
  const { interaction, musicManager, replies, pauseCalls } = setup({ ...playingInBotChannel, channelId: "general" });

  await pauseCommand.execute(interaction, musicManager);

  assert.deepEqual(pauseCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

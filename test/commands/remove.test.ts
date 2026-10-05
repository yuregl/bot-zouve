import assert from "node:assert/strict";
import { test } from "node:test";
import { ChannelType, Collection, MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";
import { removeCommand } from "../../src/commands/remove.js";
import type { MusicManager, RemoveOutcome } from "../../src/music/music-manager.js";
import { MUSIC_CHANNEL_NAME } from "../../src/music/music-channel.js";
import type { Track } from "../../src/music/track.js";

const MUSIC_CHANNEL_ID = "music";
const BOT_VOICE_CHANNEL_ID = "voice-1";

const TRACK: Track = { title: "Numb", url: "https://www.youtube.com/watch?v=A", durationSeconds: 185, requestedBy: "user" };

function setup(options: {
  position: number;
  channelId?: string;
  memberVoiceChannelId?: string;
  botVoiceChannelId?: string;
  outcome?: RemoveOutcome;
}) {
  const replies: (string | InteractionReplyOptions)[] = [];
  const removeCalls: number[] = [];

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
    options: { getInteger: () => options.position },
    reply: async (response: string | InteractionReplyOptions) => {
      replies.push(response);
    },
  } as unknown as ChatInputCommandInteraction;

  const musicManager = {
    getVoiceChannelId: () => options.botVoiceChannelId,
    remove: (_guildId: string, position: number) => {
      removeCalls.push(position);
      return options.outcome ?? { status: "removed", track: TRACK };
    },
  } as unknown as MusicManager;

  return { interaction, musicManager, replies, removeCalls };
}

function isEphemeral(response: string | InteractionReplyOptions | undefined): boolean {
  return typeof response === "object" && response.flags === MessageFlags.Ephemeral;
}

const inBotChannel = { memberVoiceChannelId: BOT_VOICE_CHANNEL_ID, botVoiceChannelId: BOT_VOICE_CHANNEL_ID };

test("/remove removes the track at the given position", async () => {
  const { interaction, musicManager, replies, removeCalls } = setup({ ...inBotChannel, position: 2 });

  await removeCommand.execute(interaction, musicManager);

  assert.deepEqual(removeCalls, [2]);
  assert.equal(replies[0], "Removed **Numb** from the queue.");
});

test("/remove says how many tracks are queued when the position does not exist", async () => {
  const { interaction, musicManager, replies } = setup({
    ...inBotChannel,
    position: 5,
    outcome: { status: "out-of-range", size: 2 },
  });

  await removeCommand.execute(interaction, musicManager);

  assert.ok(isEphemeral(replies[0]));
  assert.match(String((replies[0] as InteractionReplyOptions).content), /no track 5 .* 2 tracks/);
});

test("/remove refuses when the queue is empty", async () => {
  for (const options of [{ ...inBotChannel, outcome: { status: "empty" } as const }, { memberVoiceChannelId: BOT_VOICE_CHANNEL_ID }]) {
    const { interaction, musicManager, replies } = setup({ ...options, position: 1 });

    await removeCommand.execute(interaction, musicManager);

    assert.ok(isEphemeral(replies[0]));
  }
});

test("/remove refuses when the member is in another voice channel", async () => {
  const { interaction, musicManager, replies, removeCalls } = setup({
    position: 1,
    memberVoiceChannelId: "voice-2",
    botVoiceChannelId: BOT_VOICE_CHANNEL_ID,
  });

  await removeCommand.execute(interaction, musicManager);

  assert.deepEqual(removeCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/remove refuses outside the music channel", async () => {
  const { interaction, musicManager, replies, removeCalls } = setup({ ...inBotChannel, position: 1, channelId: "general" });

  await removeCommand.execute(interaction, musicManager);

  assert.deepEqual(removeCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

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
  end?: number;
  channelId?: string;
  memberVoiceChannelId?: string;
  botVoiceChannelId?: string;
  outcome?: RemoveOutcome;
}) {
  const replies: (string | InteractionReplyOptions)[] = [];
  const removeCalls: [number, number][] = [];

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
    options: { getInteger: (name: string) => (name === "start" ? options.position : (options.end ?? null)) },
    reply: async (response: string | InteractionReplyOptions) => {
      replies.push(response);
    },
  } as unknown as ChatInputCommandInteraction;

  const musicManager = {
    getVoiceChannelId: () => options.botVoiceChannelId,
    remove: (_guildId: string, start: number, end: number) => {
      removeCalls.push([start, end]);
      return options.outcome ?? { status: "removed", tracks: [TRACK] };
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

  assert.deepEqual(removeCalls, [[2, 2]]);
  assert.equal(replies[0], "Removed **Numb** from the queue.");
});

test("/remove removes a range of tracks", async () => {
  const { interaction, musicManager, replies, removeCalls } = setup({
    ...inBotChannel,
    position: 2,
    end: 4,
    outcome: { status: "removed", tracks: [TRACK, TRACK, TRACK] },
  });

  await removeCommand.execute(interaction, musicManager);

  assert.deepEqual(removeCalls, [[2, 4]]);
  assert.equal(replies[0], "Removed 3 tracks (2 to 4) from the queue.");
});

test("/remove explains why a range is refused", async () => {
  const outcome = { status: "out-of-range", size: 3 } as const;
  const backwards = setup({ ...inBotChannel, position: 4, end: 2, outcome });
  const tooLong = setup({ ...inBotChannel, position: 2, end: 9, outcome });

  await removeCommand.execute(backwards.interaction, backwards.musicManager);
  await removeCommand.execute(tooLong.interaction, tooLong.musicManager);

  assert.match(String((backwards.replies[0] as InteractionReplyOptions).content), /end \(2\) must not come before the start \(4\)/);
  assert.match(String((tooLong.replies[0] as InteractionReplyOptions).content), /Tracks 2 to 9 are not all in the queue; it has 3 tracks/);
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

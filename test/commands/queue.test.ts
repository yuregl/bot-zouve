import assert from "node:assert/strict";
import { test } from "node:test";
import { ChannelType, Collection, MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";
import { buildQueueEmbed, queueCommand, QUEUE_PAGE_SIZE } from "../../src/commands/queue.js";
import type { MusicManager, QueueSnapshot } from "../../src/music/music-manager.js";
import { MUSIC_CHANNEL_NAME } from "../../src/music/music-channel.js";
import type { Track } from "../../src/music/track.js";

const MUSIC_CHANNEL_ID = "music";

function track(title: string, durationSeconds = 60): Track {
  return { title, url: `https://www.youtube.com/watch?v=${title}`, durationSeconds, requestedBy: "user" };
}

function setup(options: { channelId?: string; queue?: QueueSnapshot }) {
  const replies: (string | InteractionReplyOptions)[] = [];

  const guild = {
    channels: {
      cache: new Collection([
        [MUSIC_CHANNEL_ID, { id: MUSIC_CHANNEL_ID, name: MUSIC_CHANNEL_NAME, type: ChannelType.GuildText }],
      ]),
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

  const musicManager = { getQueue: () => options.queue } as unknown as MusicManager;

  return { interaction, musicManager, replies };
}

function isEphemeral(response: string | InteractionReplyOptions | undefined): boolean {
  return typeof response === "object" && response.flags === MessageFlags.Ephemeral;
}

test("buildQueueEmbed shows the current track, the next tracks, and the total", () => {
  const embed = buildQueueEmbed({ current: track("A", 120), paused: false, upcoming: [track("B", 60), track("C", 30)] });
  const description = embed.data.description ?? "";

  assert.match(description, /Now playing\*\*\n▶ \[A\]/);
  assert.match(description, /1\. \[B\]/);
  assert.match(description, /2\. \[C\]/);
  assert.equal(embed.data.footer?.text, "3 tracks · 3:30 total");
});

test("buildQueueEmbed marks a paused track", () => {
  const embed = buildQueueEmbed({ current: track("A"), paused: true, upcoming: [] });

  assert.match(embed.data.description ?? "", /Paused\*\*\n⏸ \[A\]/);
  assert.doesNotMatch(embed.data.description ?? "", /Up next/);
  assert.equal(embed.data.footer?.text, "1 track · 1:00 total");
});

test("buildQueueEmbed lists only the first page and counts the rest", () => {
  const upcoming = Array.from({ length: QUEUE_PAGE_SIZE + 3 }, (_, index) => track(`T${index + 1}`));
  const description = buildQueueEmbed({ current: track("A"), paused: false, upcoming }).data.description ?? "";

  assert.match(description, new RegExp(`${QUEUE_PAGE_SIZE}\\. \\[T${QUEUE_PAGE_SIZE}\\]`));
  assert.doesNotMatch(description, new RegExp(`\\[T${QUEUE_PAGE_SIZE + 1}\\]`));
  assert.match(description, /…and 3 more tracks/);
});

test("/queue replies publicly with the queue", async () => {
  const { interaction, musicManager, replies } = setup({
    queue: { current: track("A"), paused: false, upcoming: [track("B")] },
  });

  await queueCommand.execute(interaction, musicManager);

  assert.equal(replies.length, 1);
  assert.equal(isEphemeral(replies[0]), false);
  assert.ok(typeof replies[0] === "object" && replies[0].embeds?.length === 1);
});

test("/queue replies privately when nothing is playing or queued", async () => {
  for (const queue of [undefined, { paused: false, upcoming: [] }]) {
    const { interaction, musicManager, replies } = setup({ queue });

    await queueCommand.execute(interaction, musicManager);

    assert.ok(isEphemeral(replies[0]));
  }
});

test("/queue refuses outside the music channel", async () => {
  const { interaction, musicManager, replies } = setup({
    channelId: "general",
    queue: { current: track("A"), paused: false, upcoming: [] },
  });

  await queueCommand.execute(interaction, musicManager);

  assert.ok(isEphemeral(replies[0]));
  assert.ok(typeof replies[0] === "object" && !replies[0].embeds);
});

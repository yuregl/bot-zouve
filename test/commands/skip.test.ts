import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { ChannelType, Collection, MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";
import { skipCommand, votesNeeded } from "../../src/commands/skip.js";
import type { MusicManager, SkipResult } from "../../src/music/music-manager.js";
import { MUSIC_CHANNEL_NAME } from "../../src/music/music-channel.js";
import type { Track } from "../../src/music/track.js";

const MUSIC_CHANNEL_ID = "music";
const BOT_VOICE_CHANNEL_ID = "voice-1";

function track(title: string, requestedBy = "user"): Track {
  return { title, url: `https://www.youtube.com/watch?v=${title}`, durationSeconds: 60, requestedBy };
}

/** A component collector that the test drives by emitting clicks and ending it. */
class FakeCollector extends EventEmitter {
  options: unknown;
  stopped?: string;
  stop(reason: string) {
    this.stopped = reason;
    this.emit("end", new Collection(), reason);
  }
}

type Reply = string | InteractionReplyOptions;

let guildCounter = 0;

/**
 * A guild where the bot plays `current` in BOT_VOICE_CHANNEL_ID with the given people, plus
 * its bot user. Each setup uses its own guild so open votes do not leak between tests.
 */
function setup(options: {
  channelId?: string;
  memberVoiceChannelId?: string | null;
  botVoiceChannelId?: string;
  current?: Track;
  listeners?: string[];
  skipResult?: SkipResult;
}) {
  const guildId = `guild-${++guildCounter}`;
  const replies: Reply[] = [];
  const messageEdits: unknown[] = [];
  const skipCalls: string[] = [];
  const collectors: FakeCollector[] = [];
  const state = { current: options.current };

  const listeners = options.listeners ?? ["user"];
  const voiceStates = new Collection<string, unknown>([
    ["bot", { channelId: BOT_VOICE_CHANNEL_ID, member: { user: { bot: true } } }],
    ...listeners.map((id) => [id, { channelId: BOT_VOICE_CHANNEL_ID, member: { user: { bot: false } } }] as const),
  ]);
  if (options.memberVoiceChannelId !== undefined) {
    voiceStates.set("user", { channelId: options.memberVoiceChannelId, member: { user: { bot: false } } });
  }

  const guild = {
    id: guildId,
    name: "Test guild",
    channels: {
      cache: new Collection([
        [MUSIC_CHANNEL_ID, { id: MUSIC_CHANNEL_ID, name: MUSIC_CHANNEL_NAME, type: ChannelType.GuildText }],
      ]),
    },
    voiceStates: { cache: voiceStates },
  };

  const message = {
    edit: async (edit: unknown) => {
      messageEdits.push(edit);
    },
    createMessageComponentCollector: (collectorOptions: unknown) => {
      const collector = new FakeCollector();
      collector.options = collectorOptions;
      collectors.push(collector);
      return collector;
    },
  };

  const interactionFrom = (userId: string) =>
    ({
      guild,
      guildId,
      channelId: options.channelId ?? MUSIC_CHANNEL_ID,
      user: { id: userId, tag: `${userId}#0001` },
      inGuild: () => true,
      reply: async (response: Reply & { withResponse?: boolean }) => {
        replies.push(response);
        return typeof response === "object" && response.withResponse ? { resource: { message } } : undefined;
      },
    }) as unknown as ChatInputCommandInteraction;

  const musicManager = {
    timeouts: { idleMs: 1, aloneMs: 1, skipVoteMs: 60_000 },
    getVoiceChannelId: () => options.botVoiceChannelId,
    getQueue: () => (state.current ? { current: state.current, paused: false, upcoming: [] } : undefined),
    skip: (id: string) => {
      skipCalls.push(id);
      return options.skipResult ?? (state.current ? { skipped: state.current } : undefined);
    },
  } as unknown as MusicManager;

  /** Clicks the vote button as a member and returns what the click replied or updated. */
  const click = async (userId: string) => {
    const responses: { kind: "reply" | "update"; value: Reply }[] = [];
    collectors.at(-1)?.emit("collect", {
      user: { id: userId },
      reply: async (value: Reply) => {
        responses.push({ kind: "reply", value });
      },
      update: async (value: Reply) => {
        responses.push({ kind: "update", value });
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    return responses;
  };

  const run = (userId = "user") => skipCommand.execute(interactionFrom(userId), musicManager);

  return { run, click, replies, messageEdits, skipCalls, collectors, state, voiceStates };
}

function isEphemeral(response: Reply | undefined): boolean {
  return typeof response === "object" && response.flags === MessageFlags.Ephemeral;
}

function content(response: Reply | undefined): string {
  return typeof response === "string" ? response : String(response?.content);
}

const inBotChannel = { memberVoiceChannelId: BOT_VOICE_CHANNEL_ID, botVoiceChannelId: BOT_VOICE_CHANNEL_ID };

test("votesNeeded asks for more than half of the people in the voice channel", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(votesNeeded), [1, 2, 2, 3, 3]);
});

test("/skip skips at once a track the member requested", async () => {
  const { run, replies, skipCalls } = setup({
    ...inBotChannel,
    current: track("A"),
    listeners: ["user", "ana", "bia"],
    skipResult: { skipped: track("A"), next: track("B") },
  });

  await run();

  assert.equal(skipCalls.length, 1);
  assert.equal(replies[0], "Skipped **A**. Up next: **B**.");
});

test("/skip says when the queue is now empty", async () => {
  const { run, replies } = setup({ ...inBotChannel, current: track("A") });

  await run();

  assert.equal(replies[0], "Skipped **A**. The queue is now empty.");
});

test("/skip of someone else's track skips at once when the member is the only listener", async () => {
  const { run, replies, skipCalls } = setup({ ...inBotChannel, current: track("A", "ana") });

  await run();

  assert.equal(skipCalls.length, 1);
  assert.equal(replies[0], "Skipped **A**. The queue is now empty.");
});

test("a vote skips someone else's track once more than half of the channel votes", async () => {
  const { run, click, replies, skipCalls, collectors } = setup({
    ...inBotChannel,
    current: track("A", "ana"),
    listeners: ["user", "ana", "bia", "caio"],
  });

  await run();

  const voteReply = replies[0] as InteractionReplyOptions;
  assert.equal(content(voteReply), "Vote to skip **A**: 1/3. Press the button to vote.");
  assert.equal(voteReply.components?.length, 1);
  assert.deepEqual(collectors.map((collector) => (collector.options as { time: number }).time), [60_000]);

  // A second vote from the same member is not counted.
  assert.match(content((await click("user"))[0]?.value), /already voted/);
  // People outside the voice channel cannot vote.
  assert.match(content((await click("stranger"))[0]?.value), /Join the bot's voice channel/);

  assert.deepEqual(await click("bia"), [{ kind: "update", value: { content: "Vote to skip **A**: 2/3. Press the button to vote." } }]);
  assert.deepEqual(skipCalls, []);

  const [passed] = await click("caio");
  assert.deepEqual(passed, { kind: "update", value: { content: "Vote passed. Skipped **A**. The queue is now empty.", components: [] } });
  assert.equal(skipCalls.length, 1);
  assert.equal(collectors[0]?.stopped, "passed");
});

test("a vote expires when not enough people vote in time", async () => {
  const { run, messageEdits, skipCalls, collectors } = setup({
    ...inBotChannel,
    current: track("A", "ana"),
    listeners: ["user", "ana", "bia"],
  });

  await run();
  collectors[0]?.stop("time");

  assert.deepEqual(skipCalls, []);
  assert.deepEqual(messageEdits, [{ content: "The vote to skip **A** expired with 1/2 votes.", components: [] }]);
});

test("/skip during an open vote counts as a vote", async () => {
  const { run, replies, messageEdits, skipCalls, collectors } = setup({
    ...inBotChannel,
    current: track("A", "ana"),
    listeners: ["user", "ana", "bia", "caio", "davi"],
  });
  await run("user");
  await run("bia");
  assert.match(content(replies[1]), /Vote counted: 2\/3/);
  assert.ok(isEphemeral(replies[1]));
  assert.deepEqual(messageEdits.at(-1), { content: "Vote to skip **A**: 2/3. Press the button to vote." });

  await run("bia");
  assert.match(content(replies[2]), /already voted/);

  await run("caio");
  assert.equal(replies[3], "Vote passed. Skipped **A**. The queue is now empty.");
  assert.equal(skipCalls.length, 1);
  assert.equal(collectors[0]?.stopped, "passed");
});

test("a vote ends when its track is over", async () => {
  const { run, click, replies, state, collectors } = setup({
    ...inBotChannel,
    current: track("A", "ana"),
    listeners: ["user", "ana", "bia", "caio"],
  });

  await run();
  state.current = track("B", "ana");

  const [ended] = await click("bia");
  assert.deepEqual(ended, { kind: "update", value: { content: "The vote to skip **A** ended because the track is over.", components: [] } });
  assert.equal(collectors[0]?.stopped, "track-changed");

  // A new /skip opens a vote for the track playing now.
  await run();
  assert.match(content(replies.at(-1)), /Vote to skip \*\*B\*\*: 1\/3/);
});

test("/skip refuses when nothing is playing", async () => {
  const { run, replies } = setup(inBotChannel);

  await run();

  assert.ok(isEphemeral(replies[0]));
});

test("/skip refuses when the bot is not connected", async () => {
  const { run, replies, skipCalls } = setup({ memberVoiceChannelId: BOT_VOICE_CHANNEL_ID, current: track("A") });

  await run();

  assert.deepEqual(skipCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/skip refuses when the member is in another voice channel", async () => {
  const { run, replies, skipCalls } = setup({
    memberVoiceChannelId: "voice-2",
    botVoiceChannelId: BOT_VOICE_CHANNEL_ID,
    current: track("A"),
  });

  await run();

  assert.deepEqual(skipCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

test("/skip refuses outside the music channel", async () => {
  const { run, replies, skipCalls } = setup({ ...inBotChannel, channelId: "general", current: track("A") });

  await run();

  assert.deepEqual(skipCalls, []);
  assert.ok(isEphemeral(replies[0]));
});

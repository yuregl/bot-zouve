import assert from "node:assert/strict";
import { test } from "node:test";
import { ChannelType, Collection, MessageFlags, type ChatInputCommandInteraction, type InteractionReplyOptions } from "discord.js";
import { executePlay } from "../../src/commands/play.js";
import type { EnqueueResult, MusicManager } from "../../src/music/music-manager.js";
import { MUSIC_CHANNEL_NAME } from "../../src/music/music-channel.js";
import type { Track } from "../../src/music/track.js";
import { type ResolverMatch, type TrackResolver, UnsupportedTrackError } from "../../src/music/track-resolver.js";

const MUSIC_CHANNEL_ID = "music";
const VOICE_CHANNEL_ID = "voice-1";

function track(title: string): Track {
  return { title, url: `https://www.youtube.com/watch?v=${title}`, durationSeconds: 185, requestedBy: "user" };
}

function resolverReturning(result: Track[] | Error): TrackResolver {
  return {
    failureMessage: "Could not search YouTube right now. Try again.",
    resolve: async () => {
      if (result instanceof Error) {
        throw result;
      }
      return result;
    },
  };
}

interface Options {
  channelId?: string;
  inVoice?: boolean;
  botCanJoin?: boolean;
  botVoiceChannelId?: string;
  match?: ResolverMatch;
  enqueue?: EnqueueResult | Error;
}

function setup(options: Options = {}) {
  const replies: (string | InteractionReplyOptions)[] = [];
  const edits: string[] = [];
  const enqueued: string[] = [];
  let deferred = false;

  const voiceChannel = {
    id: VOICE_CHANNEL_ID,
    name: "General",
    joinable: options.botCanJoin ?? true,
    permissionsFor: () => ({ has: () => options.botCanJoin ?? true }),
  };

  const guild = {
    id: "guild",
    name: "Test guild",
    members: { me: {} },
    channels: {
      cache: new Collection([
        [MUSIC_CHANNEL_ID, { id: MUSIC_CHANNEL_ID, name: MUSIC_CHANNEL_NAME, type: ChannelType.GuildText }],
      ]),
    },
    voiceStates: {
      cache: new Collection(options.inVoice === false ? [] : [["user", { channel: voiceChannel }]]),
    },
  };

  const interaction = {
    guild,
    guildId: "guild",
    channelId: options.channelId ?? MUSIC_CHANNEL_ID,
    channel: { id: MUSIC_CHANNEL_ID, isSendable: () => true, send: async () => undefined },
    user: { id: "user", tag: "user#0001" },
    inGuild: () => true,
    options: { getString: () => "numb" },
    reply: async (response: string | InteractionReplyOptions) => {
      replies.push(response);
    },
    deferReply: async () => {
      deferred = true;
    },
    editReply: async (content: string) => {
      edits.push(content);
    },
  } as unknown as ChatInputCommandInteraction;

  const musicManager = {
    getVoiceChannelId: () => options.botVoiceChannelId,
    enqueue: async (_channel: unknown, queued: Track): Promise<EnqueueResult> => {
      if (options.enqueue instanceof Error) {
        throw options.enqueue;
      }
      enqueued.push(queued.title);
      return options.enqueue ?? { startedPlaying: true, position: 0 };
    },
  } as unknown as MusicManager;

  const resolvers = {
    find: (): ResolverMatch => options.match ?? { resolver: resolverReturning([track("Numb")]), query: "numb" },
  };

  return {
    run: () => executePlay(interaction, musicManager, resolvers),
    replies,
    edits,
    enqueued,
    wasDeferred: () => deferred,
  };
}

function isEphemeral(response: string | InteractionReplyOptions | undefined): boolean {
  return typeof response === "object" && response.flags === MessageFlags.Ephemeral;
}

test("/play queues the resolved track and says it starts now", async () => {
  const { run, edits, enqueued, wasDeferred } = setup();

  await run();

  assert.equal(wasDeferred(), true);
  assert.deepEqual(enqueued, ["Numb"]);
  assert.deepEqual(edits, ["Added to the queue: **Numb** (3:05) — starting now."]);
});

test("/play says the queue position when something is already playing", async () => {
  const { run, edits } = setup({ enqueue: { startedPlaying: false, position: 3 } });

  await run();

  assert.deepEqual(edits, ["Added to the queue at position 3: **Numb** (3:05)"]);
});

test("/play queues every track a resolver returns", async () => {
  const { run, edits, enqueued } = setup({
    match: { resolver: resolverReturning([track("A"), track("B"), track("C")]), query: "album" },
  });

  await run();

  assert.deepEqual(enqueued, ["A", "B", "C"]);
  assert.match(edits[0] ?? "", /\*\*A\*\* \(3:05\) and 2 more — starting now/);
});

test("/play shows the resolver's reason when a request is refused", async () => {
  const { run, edits, enqueued } = setup({
    match: { resolver: resolverReturning(new UnsupportedTrackError("Live streams are not supported.")), query: "live" },
  });

  await run();

  assert.deepEqual(enqueued, []);
  assert.deepEqual(edits, ["Live streams are not supported."]);
});

test("/play shows the resolver's failure message when resolving fails", async () => {
  const { run, edits } = setup({ match: { resolver: resolverReturning(new Error("yt-dlp crashed")), query: "numb" } });

  await run();

  assert.deepEqual(edits, ["Could not search YouTube right now. Try again."]);
});

test("/play reports when nothing was found or the bot cannot connect", async () => {
  const empty = setup({ match: { resolver: resolverReturning([]), query: "numb" } });
  await empty.run();
  assert.deepEqual(empty.edits, ["Nothing to play was found for that request."]);

  const offline = setup({ enqueue: new Error("timeout") });
  await offline.run();
  assert.deepEqual(offline.edits, ["Could not connect to the voice channel. Try again."]);
});

test("/play refuses requests the registry does not accept, before resolving", async () => {
  const { run, replies, wasDeferred } = setup({ match: { reason: "Only links to a single YouTube video are supported." } });

  await run();

  assert.equal(wasDeferred(), false);
  assert.ok(isEphemeral(replies[0]));
});

test("/play checks the channel, the member's voice channel, and the bot's permissions first", async () => {
  const cases: Options[] = [
    { channelId: "general" },
    { inVoice: false },
    { botCanJoin: false },
    { botVoiceChannelId: "voice-2" },
  ];

  for (const options of cases) {
    const { run, replies, enqueued, wasDeferred } = setup(options);

    await run();

    assert.ok(isEphemeral(replies[0]), JSON.stringify(options));
    assert.equal(wasDeferred(), false, JSON.stringify(options));
    assert.deepEqual(enqueued, [], JSON.stringify(options));
  }
});

test("/play adds tracks when the bot is already in the member's voice channel", async () => {
  const { run, enqueued } = setup({ botVoiceChannelId: VOICE_CHANNEL_ID });

  await run();

  assert.deepEqual(enqueued, ["Numb"]);
});

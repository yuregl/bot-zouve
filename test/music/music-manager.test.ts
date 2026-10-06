import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mock, test } from "node:test";
import type { VoiceBasedChannel } from "discord.js";
import type { Track } from "../../src/music/track.js";

// The voice library is replaced so sessions can be created without connecting to Discord.
const voice = await import("@discordjs/voice");
const { AudioPlayerStatus, VoiceConnectionStatus } = voice;

/** A voice connection that is ready at once and emits Destroyed when destroyed, like the real one. */
class FakeConnection extends EventEmitter {
  state = { status: VoiceConnectionStatus.Ready as string };
  subscribed: unknown;
  constructor(readonly joinConfig: { channelId: string; guildId: string; selfDeaf: boolean }) {
    super();
  }
  subscribe(player: unknown) {
    this.subscribed = player;
  }
  destroy() {
    const oldState = this.state;
    this.state = { status: VoiceConnectionStatus.Destroyed };
    this.emit(VoiceConnectionStatus.Destroyed, oldState, this.state);
  }
}

/** An audio player that moves between states and emits the same events as the real one. */
class FakeAudioPlayer extends EventEmitter {
  state: { status: string; resource?: { playbackDuration: number } } = { status: AudioPlayerStatus.Idle };
  private setState(status: string, resource = this.state.resource) {
    const oldState = this.state;
    this.state = { status, resource: status === AudioPlayerStatus.Idle ? undefined : resource };
    this.emit("stateChange", oldState, this.state);
    this.emit(status, oldState, this.state);
  }
  play(resource: { playbackDuration: number }) {
    this.setState(AudioPlayerStatus.Buffering, resource);
    this.setState(AudioPlayerStatus.Playing, resource);
  }
  stop() {
    if (this.state.status === AudioPlayerStatus.Idle) {
      return false;
    }
    this.setState(AudioPlayerStatus.Idle);
    return true;
  }
  pause() {
    this.setState(AudioPlayerStatus.Paused);
    return true;
  }
  unpause() {
    this.setState(AudioPlayerStatus.Playing);
    return true;
  }
}

const voiceFakes = {
  connections: [] as FakeConnection[],
  players: [] as FakeAudioPlayer[],
  connectionReady: true,
};

mock.module("@discordjs/voice", {
  namedExports: {
    ...voice,
    joinVoiceChannel: (config: { channelId: string; guildId: string; selfDeaf: boolean }) => {
      const connection = new FakeConnection(config);
      voiceFakes.connections.push(connection);
      return connection;
    },
    createAudioPlayer: () => {
      const player = new FakeAudioPlayer();
      voiceFakes.players.push(player);
      return player;
    },
    entersState: async (target: FakeConnection, status: string) => {
      if (status === VoiceConnectionStatus.Ready && !voiceFakes.connectionReady) {
        throw new Error("Did not become ready");
      }
      if (status !== VoiceConnectionStatus.Ready) {
        throw new Error("Did not reconnect");
      }
      return target;
    },
    getVoiceConnection: () => undefined,
  },
});

const { MusicManager, prepareUpcomingTrack } = await import("../../src/music/music-manager.js");

const FAR_FUTURE = Date.now() + 24 * 60 * 60_000;

/** An audio player that records what the manager asks of it instead of playing audio. */
function fakePlayer(status: "playing" | "paused" | "idle" = "playing", playbackDuration = 0) {
  const calls: string[] = [];
  const played: unknown[] = [];
  return {
    calls,
    played,
    state: status === "idle" ? { status } : { status, resource: { playbackDuration } },
    play: (resource: unknown) => {
      calls.push("play");
      played.push(resource);
    },
    stop: () => {
      calls.push("stop");
      return true;
    },
    pause: () => {
      calls.push("pause");
      return true;
    },
    unpause: () => {
      calls.push("unpause");
      return true;
    },
  };
}

/** A manager with a session in the guild, without connecting to Discord or downloading audio. */
function managerWithSession(options: {
  queue?: string[];
  current?: Track | null;
  player?: ReturnType<typeof fakePlayer>;
  startOffsetSeconds?: number;
} = {}) {
  const resources: { track: string; offsetSeconds: number }[] = [];
  const manager = new MusicManager((queued, offsetSeconds) => {
    resources.push({ track: queued.title, offsetSeconds });
    return { track: queued.title, offsetSeconds } as never;
  });
  const queue = (options.queue ?? []).map((title) => track(title, 60, FAR_FUTURE));
  const player = options.player ?? fakePlayer();
  const session = {
    connection: { joinConfig: { channelId: "voice-1" } },
    player,
    queue,
    current: options.current === null ? undefined : (options.current ?? track("current", 213, FAR_FUTURE)),
    startOffsetSeconds: options.startOffsetSeconds ?? 0,
    seeking: false,
    notify: () => {},
  };
  (manager as unknown as { sessions: Map<string, unknown> }).sessions.set("guild", session);
  return { manager, queue, player, session, resources };
}

function managerWithQueue(titles: string[]) {
  return managerWithSession({ queue: titles });
}

test("getQueue reports the current track, the queue, and the elapsed time after a seek", () => {
  const { manager } = managerWithSession({
    queue: ["A"],
    player: fakePlayer("playing", 5_000),
    startOffsetSeconds: 60,
  });

  const snapshot = manager.getQueue("guild");

  assert.equal(snapshot?.current?.title, "current");
  assert.equal(snapshot?.elapsedSeconds, 65);
  assert.equal(snapshot?.paused, false);
  assert.deepEqual(snapshot?.upcoming.map((queued) => queued.title), ["A"]);
  assert.equal(manager.getVoiceChannelId("guild"), "voice-1");
  assert.equal(new MusicManager().getQueue("guild"), undefined);
});

test("seek restarts the current track at the position without announcing it again", () => {
  const { manager, player, session, resources } = managerWithSession();

  const outcome = manager.seek("guild", 133);

  assert.equal(outcome.status, "seeked");
  assert.deepEqual(resources, [{ track: "current", offsetSeconds: 133 }]);
  assert.deepEqual(player.calls, ["play"]);
  assert.equal(session.startOffsetSeconds, 133);
  assert.equal(session.seeking, true);
});

test("seek refuses positions past the end and requests without a track", () => {
  const { manager, player } = managerWithSession();

  assert.equal(manager.seek("guild", 213).status, "out-of-range");
  assert.equal(managerWithSession({ current: null }).manager.seek("guild", 10).status, "not-playing");
  assert.deepEqual(player.calls, []);
});

test("skip ends the current track and reports the next one", () => {
  const { manager, player } = managerWithSession({ queue: ["A", "B"] });

  const result = manager.skip("guild");

  assert.equal(result?.skipped.title, "current");
  assert.equal(result?.next?.title, "A");
  assert.deepEqual(player.calls, ["stop"]);
  assert.equal(managerWithSession({ current: null }).manager.skip("guild"), undefined);
});

test("stop clears the queue before stopping, so nothing else starts", () => {
  const { manager, player, queue } = managerWithSession({ queue: ["A", "B"] });

  assert.equal(manager.stop("guild"), true);
  assert.equal(queue.length, 0);
  assert.deepEqual(player.calls, ["stop"]);
  assert.equal(managerWithSession({ current: null }).manager.stop("guild"), false);
});

test("pause and resume act only in the matching player state", () => {
  const playing = managerWithSession({ player: fakePlayer("playing") });
  assert.equal(playing.manager.pause("guild"), true);
  assert.equal(playing.manager.resume("guild"), false);
  assert.deepEqual(playing.player.calls, ["pause"]);

  const paused = managerWithSession({ player: fakePlayer("paused") });
  assert.equal(paused.manager.resume("guild"), true);
  assert.equal(paused.manager.pause("guild"), false);
  assert.deepEqual(paused.player.calls, ["unpause"]);
  assert.equal(paused.manager.getQueue("guild")?.paused, true);
});

test("remove takes the track at its /queue number out of the queue", () => {
  const { manager, queue } = managerWithQueue(["A", "B", "C"]);

  const outcome = manager.remove("guild", 2);

  assert.equal(outcome.status, "removed");
  assert.equal(outcome.status === "removed" && outcome.track.title, "B");
  assert.deepEqual(queue.map((queued) => queued.title), ["A", "C"]);
});

test("remove refuses positions that do not exist", () => {
  const { manager, queue } = managerWithQueue(["A", "B"]);

  for (const position of [0, 3, 1.5]) {
    assert.deepEqual(manager.remove("guild", position), { status: "out-of-range", size: 2 });
  }
  assert.equal(queue.length, 2);
});

test("remove reports an empty queue", () => {
  assert.deepEqual(managerWithQueue([]).manager.remove("guild", 1), { status: "empty" });
  assert.deepEqual(new MusicManager().remove("guild", 1), { status: "empty" });
});

const NOW = 1_000_000_000;

function track(title: string, durationSeconds: number, expiresAt?: number): Track {
  return {
    title,
    url: `https://www.youtube.com/watch?v=${title}`,
    durationSeconds,
    requestedBy: "u",
    audio: expiresAt === undefined ? undefined : { url: "direct", headers: {}, expiresAt },
  };
}

function recorder() {
  const refreshed: string[] = [];
  return {
    refreshed,
    refresh: async (upcoming: Track) => {
      refreshed.push(upcoming.title);
    },
  };
}

test("prepareUpcomingTrack refreshes a link that expires before the current track ends", () => {
  const { refreshed, refresh } = recorder();

  // The current track lasts 10 minutes, but the next link expires in 5.
  prepareUpcomingTrack(track("next", 60, NOW + 5 * 60_000), track("current", 600), refresh, NOW);

  assert.deepEqual(refreshed, ["next"]);
});

test("prepareUpcomingTrack refreshes a track without a direct link", () => {
  const { refreshed, refresh } = recorder();

  prepareUpcomingTrack(track("next", 60), track("current", 600), refresh, NOW);

  assert.deepEqual(refreshed, ["next"]);
});

test("prepareUpcomingTrack keeps a link that is still valid when the track plays", () => {
  const { refreshed, refresh } = recorder();

  prepareUpcomingTrack(track("next", 60, NOW + 60 * 60_000), track("current", 600), refresh, NOW);
  prepareUpcomingTrack(undefined, track("current", 600), refresh, NOW);

  assert.deepEqual(refreshed, []);
});

function voiceChannel(id = "voice-1"): VoiceBasedChannel {
  return { id, name: "General", guild: { id: "guild", name: "Test guild", voiceAdapterCreator: () => ({}) } } as never;
}

/** A manager whose audio resources only record which track and position they were made for. */
function playingManager() {
  const played: { track: string; offsetSeconds: number }[] = [];
  const notifications: unknown[] = [];
  const manager = new MusicManager((queued, offsetSeconds) => {
    played.push({ track: queued.title, offsetSeconds });
    return { playbackDuration: 0 } as never;
  });
  const notify = (message: unknown) => {
    notifications.push(message);
  };
  return { manager, played, notifications, notify };
}

function freshTrack(title: string): Track {
  return track(title, 60, FAR_FUTURE);
}

test("enqueue joins the voice channel and starts the first track", async () => {
  const { manager, played, notifications, notify } = playingManager();

  const result = await manager.enqueue(voiceChannel(), freshTrack("A"), notify);

  assert.deepEqual(result, { startedPlaying: true, position: 0 });
  assert.deepEqual(played, [{ track: "A", offsetSeconds: 0 }]);
  const connection = voiceFakes.connections.at(-1);
  assert.deepEqual(connection?.joinConfig.channelId, "voice-1");
  assert.equal(connection?.joinConfig.selfDeaf, true);
  assert.equal(manager.getVoiceChannelId("guild"), "voice-1");
  // The "Now playing" announcement.
  assert.equal(notifications.length, 1);
});

test("enqueue adds later tracks to the queue, and they play in order", async () => {
  const { manager, played, notify } = playingManager();

  await manager.enqueue(voiceChannel(), freshTrack("A"), notify);
  assert.deepEqual(await manager.enqueue(voiceChannel(), freshTrack("B"), notify), { startedPlaying: false, position: 1 });
  assert.deepEqual(await manager.enqueue(voiceChannel(), freshTrack("C"), notify), { startedPlaying: false, position: 2 });

  // Each track that ends starts the next one.
  voiceFakes.players.at(-1)?.stop();
  voiceFakes.players.at(-1)?.stop();

  assert.deepEqual(played.map((entry) => entry.track), ["A", "B", "C"]);
  assert.equal(manager.getQueue("guild")?.current?.title, "C");
});

test("concurrent requests share one voice connection", async () => {
  const { manager, notify } = playingManager();
  const before = voiceFakes.connections.length;

  await Promise.all([
    manager.enqueue(voiceChannel(), freshTrack("A"), notify),
    manager.enqueue(voiceChannel(), freshTrack("B"), notify),
  ]);

  assert.equal(voiceFakes.connections.length - before, 1);
});

test("a seek is not announced as a new track", async () => {
  const { manager, notifications, notify } = playingManager();
  await manager.enqueue(voiceChannel(), freshTrack("A"), notify);

  manager.seek("guild", 30);

  assert.equal(notifications.length, 1);
});

test("a player error is reported in the channel", async () => {
  const { manager, notifications, notify } = playingManager();
  await manager.enqueue(voiceChannel(), freshTrack("A"), notify);

  voiceFakes.players.at(-1)?.emit("error", new Error("stream failed"));

  assert.match(String(notifications.at(-1)), /Could not play \*\*A\*\*/);
});

test("leave destroys the connection and discards the session and queue", async () => {
  const { manager, played, notify } = playingManager();
  await manager.enqueue(voiceChannel(), freshTrack("A"), notify);
  await manager.enqueue(voiceChannel(), freshTrack("B"), notify);

  assert.equal(manager.leave("guild"), true);

  assert.equal(manager.getQueue("guild"), undefined);
  // B was discarded instead of starting on the destroyed connection.
  assert.deepEqual(played.map((entry) => entry.track), ["A"]);
  assert.equal(manager.leave("guild"), false);
});

test("a lost connection that does not recover ends the session", async () => {
  const { manager, notify } = playingManager();
  await manager.enqueue(voiceChannel(), freshTrack("A"), notify);

  voiceFakes.connections.at(-1)?.emit(VoiceConnectionStatus.Disconnected);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(manager.getQueue("guild"), undefined);
});

test("enqueue fails and cleans up when the voice connection does not become ready", async (t) => {
  t.after(() => {
    voiceFakes.connectionReady = true;
  });
  voiceFakes.connectionReady = false;
  const { manager, notify } = playingManager();

  await assert.rejects(manager.enqueue(voiceChannel(), freshTrack("A"), notify), /Could not connect/);

  assert.equal(voiceFakes.connections.at(-1)?.state.status, VoiceConnectionStatus.Destroyed);
  assert.equal(manager.getQueue("guild"), undefined);
});

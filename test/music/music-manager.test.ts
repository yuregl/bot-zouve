import assert from "node:assert/strict";
import { test } from "node:test";
import { MusicManager, prepareUpcomingTrack } from "../../src/music/music-manager.js";
import type { Track } from "../../src/music/track.js";

const FAR_FUTURE = Date.now() + 24 * 60 * 60_000;

/** A manager with a session holding the given queue, without connecting to Discord. */
function managerWithQueue(titles: string[]) {
  const manager = new MusicManager();
  const queue = titles.map((title) => track(title, 60, FAR_FUTURE));
  const sessions = (manager as unknown as { sessions: Map<string, unknown> }).sessions;
  sessions.set("guild", { queue, current: track("current", 60, FAR_FUTURE) });
  return { manager, queue };
}

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

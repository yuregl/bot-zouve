import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareUpcomingTrack } from "../../src/music/music-manager.js";
import type { Track } from "../../src/music/track.js";

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

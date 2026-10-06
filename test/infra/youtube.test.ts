import assert from "node:assert/strict";
import { test } from "node:test";
import type { Track } from "../../src/music/track.js";
import {
  type AudioAttempt,
  getAudioSource,
  getYouTubeVideoId,
  isStoppedByPlayback,
  isYouTubeUrl,
  needsFreshAudio,
  parseContentRangeSize,
  streamFirstWorkingAttempt,
  youtubeLinkResolver,
} from "../../src/infra/youtube.js";

const TRACK: Track = { title: "A", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", durationSeconds: 60, requestedBy: "u" };

async function collect(stream: AsyncIterable<Buffer>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString();
}

function attempt(name: string, chunks: string[], failAfter?: number): AudioAttempt & { closed: boolean } {
  const result = {
    name,
    closed: false,
    async *open() {
      try {
        for (const [index, chunk] of chunks.entries()) {
          if (index === failAfter) {
            throw new Error(`${name} failed`);
          }
          yield Buffer.from(chunk);
        }
        if (failAfter !== undefined && failAfter >= chunks.length) {
          throw new Error(`${name} failed`);
        }
      } finally {
        result.closed = true;
      }
    },
  };
  return result;
}

test("getYouTubeVideoId extracts the id from YouTube video links", () => {
  assert.equal(getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(getYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(getYouTubeVideoId("  https://music.youtube.com/watch?v=dQw4w9WgXcQ  "), "dQw4w9WgXcQ");
});

test("getYouTubeVideoId ignores playlist and radio parameters", () => {
  assert.equal(
    getYouTubeVideoId("https://www.youtube.com/watch?v=RY3B_XXmTYU&list=RDRY3B_XXmTYU&start_radio=1"),
    "RY3B_XXmTYU",
  );
});

test("isYouTubeUrl rejects search terms, other sites, and playlist-only links", () => {
  assert.equal(isYouTubeUrl("never gonna give you up"), false);
  assert.equal(isYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ"), false);
  assert.equal(isYouTubeUrl("https://www.youtube.com/playlist?list=RDRY3B_XXmTYU"), false);
  assert.equal(isYouTubeUrl("https://www.youtube.com/watch?v=short"), false);
});

function accepts(link: string): boolean {
  return youtubeLinkResolver.canResolve(new URL(link));
}

test("youtubeLinkResolver accepts links to a single YouTube video", () => {
  assert.equal(accepts("https://youtu.be/dQw4w9WgXcQ"), true);
  assert.equal(accepts("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RD1"), true);
  assert.equal(accepts("https://www.youtube.com/playlist?list=RDRY3B_XXmTYU"), false);
  assert.equal(accepts("https://open.spotify.com/track/123"), false);
});

test("isStoppedByPlayback accepts yt-dlp killed after playback stopped", () => {
  assert.equal(isStoppedByPlayback({ signalCode: "SIGTERM", exitCode: null }, true), true);
});

test("isStoppedByPlayback reports failures that were not caused by stopping playback", () => {
  // Killed by something else.
  assert.equal(isStoppedByPlayback({ signalCode: "SIGTERM", exitCode: null }, false), false);
  // yt-dlp failed on its own (for example, HTTP 403) around the time playback stopped.
  assert.equal(isStoppedByPlayback({ signalCode: null, exitCode: 1 }, true), false);
  assert.equal(isStoppedByPlayback(new Error("spawn failed"), true), false);
});

test("getAudioSource reads the direct link, its expiry, and its headers", () => {
  const source = getAudioSource({
    url: "https://rr1.googlevideo.com/videoplayback?expire=1791181494&itag=251",
    protocol: "https",
    http_headers: { "User-Agent": "UA", Accept: "*/*" },
  });

  assert.deepEqual(source, {
    url: "https://rr1.googlevideo.com/videoplayback?expire=1791181494&itag=251",
    headers: { "User-Agent": "UA", Accept: "*/*" },
    expiresAt: 1_791_181_494_000,
  });
});

test("getAudioSource ignores links it cannot stream directly", () => {
  // No expiry, so it is unknown when the link stops working.
  assert.equal(getAudioSource({ url: "https://rr1.googlevideo.com/videoplayback", protocol: "https" }), undefined);
  // Segmented formats are not a single file.
  assert.equal(getAudioSource({ url: "https://manifest.googlevideo.com/x.m3u8?expire=1", protocol: "m3u8_native" }), undefined);
  assert.equal(getAudioSource({ protocol: "https" }), undefined);
  assert.equal(getAudioSource("not json"), undefined);
});

test("needsFreshAudio accepts a link that is valid when the track plays", () => {
  const now = Date.now();
  const track = { ...TRACK, audio: { url: "u", headers: {}, expiresAt: now + 3_600_000 } };

  assert.equal(needsFreshAudio(track, now), false);
  assert.equal(needsFreshAudio(track, now + 3_600_000), true);
  assert.equal(needsFreshAudio(TRACK, now), true);
});

test("parseContentRangeSize reads the total size", () => {
  assert.equal(parseContentRangeSize("bytes 0-1048575/4249228"), 4_249_228);
  assert.equal(parseContentRangeSize("bytes 0-1048575/*"), undefined);
  assert.equal(parseContentRangeSize(null), undefined);
});

test("streamFirstWorkingAttempt streams the first source that works", async () => {
  const direct = attempt("direct", ["a", "b"]);
  const ytDlp = attempt("yt-dlp", ["x"]);

  assert.equal(await collect(streamFirstWorkingAttempt(TRACK, [direct, ytDlp])), "ab");
  assert.equal(direct.closed, true);
});

test("streamFirstWorkingAttempt falls back when a source fails before any audio", async () => {
  const failing = attempt("direct", ["a"], 0);
  const empty = attempt("yt-dlp 1", []);
  const working = attempt("yt-dlp 2", ["x", "y"]);

  assert.equal(await collect(streamFirstWorkingAttempt(TRACK, [failing, empty, working])), "xy");
  assert.equal(failing.closed, true);
});

test("streamFirstWorkingAttempt does not switch sources after audio started", async () => {
  const breaking = attempt("direct", ["a", "b"], 1);
  const backup = attempt("yt-dlp", ["x"]);

  await assert.rejects(collect(streamFirstWorkingAttempt(TRACK, [breaking, backup])), /direct failed/);
  assert.equal(backup.closed, false);
});

test("streamFirstWorkingAttempt fails when every source fails", async () => {
  await assert.rejects(
    collect(streamFirstWorkingAttempt(TRACK, [attempt("a", [], 0), attempt("b", [])])),
    /Could not stream audio/,
  );
});

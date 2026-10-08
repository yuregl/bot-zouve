import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { mock, test } from "node:test";
import type { Track } from "../../src/music/track.js";
import { UnsupportedTrackError } from "../../src/music/track-resolver.js";
import type { AudioAttempt } from "../../src/infra/youtube.js";

// yt-dlp is replaced so the tests never call YouTube: each test sets what it returns.
let ytDlpJson: (url: string, flags: Record<string, unknown>) => unknown = () => ({});
let ytDlpStream: (url: string) => FakeSubprocess = () => fakeSubprocess([], { exitCode: 0 });
const ytDlpCalls: { url: string; flags: Record<string, unknown> }[] = [];

const fakeYoutubeDl = Object.assign(
  async (url: string, flags: Record<string, unknown>) => {
    ytDlpCalls.push({ url, flags });
    return ytDlpJson(url, flags);
  },
  { exec: (url: string) => ytDlpStream(url) },
);
mock.module("youtube-dl-exec", { namedExports: { youtubeDl: fakeYoutubeDl } });

const {
  createYouTubeStream,
  getAudioSource,
  getYouTubeList,
  getYouTubeVideoId,
  isStoppedByPlayback,
  isYouTubeUrl,
  needsFreshAudio,
  parseContentRangeSize,
  pickClosestDuration,
  refreshAudioSource,
  MAX_LIST_TRACKS,
  resolveYouTubeList,
  resolveYouTubeVideo,
  searchYouTube,
  searchYouTubeByDuration,
  streamFirstWorkingAttempt,
  youtubeLinkResolver,
  youtubeSearchResolver,
  checkYouTubeVideo,
  useYouTubeCookies,
} = await import("../../src/infra/youtube.js");

type FakeSubprocess = Promise<unknown> & { stdout: Readable; pid: number; kill: () => boolean; killed: boolean };

/** A yt-dlp process that writes the given chunks and then exits, or is killed. */
function fakeSubprocess(chunks: string[], exit: { exitCode?: number }): FakeSubprocess {
  let settle: { resolve: (value: unknown) => void; reject: (error: unknown) => void } | undefined;
  const promise = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  const stdout = Readable.from(chunks.map((chunk) => Buffer.from(chunk)));
  const subprocess = Object.assign(promise, {
    stdout,
    pid: 1,
    killed: false,
    kill: () => {
      subprocess.killed = true;
      settle?.reject(Object.assign(new Error("killed"), { signalCode: "SIGTERM", exitCode: null }));
      return true;
    },
  });
  stdout.once("end", () => {
    if (exit.exitCode === 0) {
      settle?.resolve(undefined);
    } else {
      settle?.reject(Object.assign(new Error("HTTP Error 403"), { signalCode: null, exitCode: exit.exitCode }));
    }
  });
  return subprocess;
}

const DIRECT_URL = `https://rr1.googlevideo.com/videoplayback?expire=${Math.floor(Date.now() / 1000) + 3600}&itag=251`;

function videoInfo(overrides: Record<string, unknown> = {}) {
  return {
    id: "dQw4w9WgXcQ",
    title: "Never Gonna Give You Up",
    duration: 213,
    is_live: false,
    url: DIRECT_URL,
    protocol: "https",
    http_headers: { "User-Agent": "UA" },
    ...overrides,
  };
}

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

test("pickClosestDuration picks the closest duration and the earlier result on ties", () => {
  const results = [
    { id: "video", duration: 188 },
    { id: "audio", duration: 186 },
    { id: "lyrics", duration: 186 },
    { id: "unknown", duration: null },
  ];

  assert.equal(pickClosestDuration(results, 186)?.id, "audio");
  assert.equal(pickClosestDuration([{ id: "unknown", duration: null }], 186)?.id, "unknown");
  assert.equal(pickClosestDuration([], 186), undefined);
  // Without a duration to compare, the first result.
  assert.equal(pickClosestDuration(results, undefined)?.id, "video");
});

function accepts(link: string): boolean {
  return youtubeLinkResolver.canResolve(new URL(link));
}

test("youtubeLinkResolver accepts links to YouTube videos, playlists, and Mixes", () => {
  assert.equal(accepts("https://youtu.be/dQw4w9WgXcQ"), true);
  assert.equal(accepts("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RD1"), true);
  assert.equal(accepts("https://www.youtube.com/playlist?list=PLabc"), true);
  assert.equal(accepts("https://www.youtube.com/feed/history?list=PLabc"), false);
  assert.equal(accepts("https://open.spotify.com/track/123"), false);
});

test("getYouTubeList reads the list, the linked video, and the index", () => {
  assert.deepEqual(
    getYouTubeList("https://www.youtube.com/watch?v=Y8CWcaXogIQ&list=RDGMEM2VCIgaiSqOfVzBAjPJm-agVMY8CWcaXogIQ&start_radio=1"),
    { listId: "RDGMEM2VCIgaiSqOfVzBAjPJm-agVMY8CWcaXogIQ", videoId: "Y8CWcaXogIQ", index: undefined },
  );
  assert.deepEqual(getYouTubeList("https://youtu.be/dQw4w9WgXcQ?list=PLabc&index=3"), {
    listId: "PLabc",
    videoId: "dQw4w9WgXcQ",
    index: 3,
  });
  assert.deepEqual(getYouTubeList("https://www.youtube.com/playlist?list=PLabc&index=0"), {
    listId: "PLabc",
    videoId: undefined,
    index: undefined,
  });
});

test("getYouTubeList ignores links without a valid list", () => {
  assert.equal(getYouTubeList("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), undefined);
  assert.equal(getYouTubeList("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=bad%20list"), undefined);
  assert.equal(getYouTubeList("https://example.com/playlist?list=PLabc"), undefined);
  assert.equal(getYouTubeList("numb"), undefined);
});

/** A flat playlist entry as yt-dlp lists it. */
function entry(id: string, extra: Record<string, unknown> = {}) {
  return { id, title: `Video ${id}`, duration: 100, ...extra };
}

const LIST_ENTRIES = [
  entry("video000001"),
  entry("private0001", { title: "[Private video]", duration: null }),
  entry("video000002"),
  entry("livestream1", { live_status: "is_live" }),
  entry("video000003"),
  entry("bad"),
];

test("resolveYouTubeList queues the list from the linked video, skipping unplayable entries", async () => {
  ytDlpJson = (url) => (url.includes("list=") ? { entries: LIST_ENTRIES } : videoInfo({ id: "video000002" }));

  const tracks = await resolveYouTubeList({ listId: "RD1", videoId: "video000002" }, "user");

  const listCall = ytDlpCalls.at(-2);
  assert.equal(listCall?.url, "https://www.youtube.com/watch?v=video000002&list=RD1");
  assert.equal(listCall?.flags.yesPlaylist, true);
  assert.equal("noPlaylist" in (listCall?.flags ?? {}), false);
  assert.deepEqual(
    tracks.map((queued) => queued.url),
    ["https://www.youtube.com/watch?v=video000002", "https://www.youtube.com/watch?v=video000003"],
  );
  // The first track is fully resolved, with a direct audio link; the rest get theirs later.
  assert.equal(tracks[0]?.audio?.url, DIRECT_URL);
  assert.deepEqual(tracks[1], {
    title: "Video video000003",
    url: "https://www.youtube.com/watch?v=video000003",
    durationSeconds: 100,
    requestedBy: "user",
  });
});

/** The ids of the tracks queued after the first one. */
function listed(tracks: Track[]): string[] {
  return tracks.slice(1).map((queued) => queued.url.slice(-11));
}

test("resolveYouTubeList starts at the index or the beginning when the video is not in the list", async () => {
  ytDlpJson = (url) => (url.includes("list=") ? { entries: LIST_ENTRIES } : videoInfo());

  assert.deepEqual(listed(await resolveYouTubeList({ listId: "PL1", videoId: "notinlist00", index: 2 }, "user")), [
    "video000003",
  ]);
  assert.deepEqual(listed(await resolveYouTubeList({ listId: "PL1", index: 9 }, "user")), ["video000002", "video000003"]);
  assert.equal(ytDlpCalls.at(-2)?.url, "https://www.youtube.com/playlist?list=PL1");
});

test("resolveYouTubeList plays only the linked video when the list is unusable", async () => {
  ytDlpJson = (url) => {
    if (url.includes("list=")) {
      throw new Error("This playlist does not exist");
    }
    return videoInfo();
  };
  assert.equal((await resolveYouTubeList({ listId: "RD1", videoId: "dQw4w9WgXcQ" }, "user")).length, 1);

  ytDlpJson = (url) => (url.includes("list=") ? "not json" : videoInfo());
  assert.equal((await resolveYouTubeList({ listId: "RD1", videoId: "dQw4w9WgXcQ" }, "user")).length, 1);
});

test("resolveYouTubeList refuses playlists that cannot be read or have nothing to play", async () => {
  ytDlpJson = () => ({ entries: [entry("private0001", { title: "[Deleted video]" })] });
  await assert.rejects(resolveYouTubeList({ listId: "PL1" }, "user"), /no playable videos/);

  ytDlpJson = () => {
    throw new Error("This playlist does not exist");
  };
  await assert.rejects(resolveYouTubeList({ listId: "PL1" }, "user"), /does not exist/);
});

test("resolveYouTubeList queues at most 50 tracks from where the list starts", async () => {
  const many = Array.from({ length: 80 }, (_, i) => entry(`video${String(i).padStart(6, "0")}`));
  ytDlpJson = (url) => (url.includes("list=") ? { entries: many } : videoInfo());

  const tracks = await resolveYouTubeList({ listId: "RD1", videoId: "video000010" }, "user");

  assert.equal(MAX_LIST_TRACKS, 50);
  assert.equal(tracks.length, 50);
  assert.equal(tracks.at(-1)?.url, "https://www.youtube.com/watch?v=video000059");
});

test("youtubeLinkResolver resolves playlist links", async () => {
  ytDlpJson = (url) => (url.includes("list=") ? { entries: LIST_ENTRIES } : videoInfo());

  const tracks = await youtubeLinkResolver.resolve("https://www.youtube.com/playlist?list=PL1", "user");

  assert.equal(tracks.length, 3);
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

test("resolveYouTubeVideo reads the title, duration, and direct audio link of a video", async () => {
  ytDlpJson = () => videoInfo();

  const track = await resolveYouTubeVideo("dQw4w9WgXcQ", "user");

  assert.equal(track.title, "Never Gonna Give You Up");
  assert.equal(track.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(track.durationSeconds, 213);
  assert.equal(track.audio?.url, DIRECT_URL);
  assert.equal(ytDlpCalls.at(-1)?.flags.format, "bestaudio[acodec=opus][ext=webm]");
});

test("resolveYouTubeVideo refuses live streams and unexpected output", async () => {
  ytDlpJson = () => videoInfo({ is_live: true });
  await assert.rejects(resolveYouTubeVideo("dQw4w9WgXcQ", "user"), UnsupportedTrackError);

  ytDlpJson = () => "not json";
  await assert.rejects(resolveYouTubeVideo("dQw4w9WgXcQ", "user"), /unexpected output/);
});

test("searchYouTube plays the first result for the terms", async () => {
  ytDlpJson = () => ({ entries: [videoInfo({ id: "first000000" }), videoInfo({ id: "second00000" })] });

  const track = await searchYouTube("numb", "user");

  assert.equal(ytDlpCalls.at(-1)?.url, "ytsearch1:numb");
  assert.equal(track.url, "https://www.youtube.com/watch?v=first000000");
});

test("searchYouTube refuses empty results and live streams, and rejects invalid ids", async () => {
  ytDlpJson = () => ({ entries: [] });
  await assert.rejects(searchYouTube("numb", "user"), /No YouTube results/);

  ytDlpJson = () => ({ entries: [videoInfo({ is_live: true })] });
  await assert.rejects(searchYouTube("numb", "user"), /live stream/);

  ytDlpJson = () => ({ entries: [videoInfo({ id: "bad" })] });
  await assert.rejects(searchYouTube("numb", "user"), /valid id/);
});

test("searchYouTubeByDuration plays the closest duration among results that are not live", async () => {
  ytDlpJson = (url) =>
    url.startsWith("ytsearch5:")
      ? {
          entries: [
            { id: "video000000", duration: 188 },
            { id: "livestream0", duration: 186, live_status: "is_live" },
            { id: "bad", duration: 186 },
            { id: "audio000000", duration: 186 },
          ],
        }
      : videoInfo({ id: "audio000000" });

  const track = await searchYouTubeByDuration("Linkin Park - Numb", 186, "user");

  assert.equal(track.url, "https://www.youtube.com/watch?v=audio000000");
  assert.equal(ytDlpCalls.at(-2)?.flags.flatPlaylist, true);
});

test("searchYouTubeByDuration refuses searches without usable results", async () => {
  for (const results of [{ entries: [{ id: "livestream0", live_status: "is_live" }] }, "not json"]) {
    ytDlpJson = () => results;
    await assert.rejects(searchYouTubeByDuration("numb", 186, "user"), UnsupportedTrackError);
  }
});

test("the YouTube resolvers resolve links and search terms", async () => {
  ytDlpJson = (url) => (url.startsWith("ytsearch1:") ? { entries: [videoInfo({ id: "searched000" })] } : videoInfo());

  const [linked] = await youtubeLinkResolver.resolve("https://youtu.be/dQw4w9WgXcQ", "user");
  const [searched] = await youtubeSearchResolver.resolve("numb", "user");

  assert.equal(linked?.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(searched?.url, "https://www.youtube.com/watch?v=searched000");
  await assert.rejects(youtubeLinkResolver.resolve("https://youtu.be/bad", "user"), UnsupportedTrackError);
});

test("refreshAudioSource replaces the link, and keeps the track when yt-dlp fails", async () => {
  const track: Track = { ...TRACK };

  ytDlpJson = () => videoInfo();
  await refreshAudioSource(track);
  assert.equal(track.audio?.url, DIRECT_URL);

  ytDlpJson = () => {
    throw new Error("yt-dlp failed");
  };
  await refreshAudioSource(track);
  assert.equal(track.audio?.url, DIRECT_URL);
});

/** Serves `audio` from the direct link in ranges, as googlevideo.com does. */
function serveDirectAudio(audio: Buffer, status = 206) {
  const ranges: string[] = [];
  mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const range = new Headers(init.headers).get("Range") ?? "";
    ranges.push(range);
    const [start = 0, end = 0] = range.replace("bytes=", "").split("-").map(Number);
    const body = audio.subarray(start, Math.min(end + 1, audio.length));
    return new Response(status === 206 ? new Uint8Array(body) : "", {
      status,
      headers: { "Content-Range": `bytes ${start}-${start + body.length - 1}/${audio.length}` },
    });
  });
  return ranges;
}

test("createYouTubeStream downloads the direct link in 1 MiB ranges", async (t) => {
  t.after(() => mock.restoreAll());
  const audio = Buffer.alloc(2.5 * 1024 * 1024, 7);
  const ranges = serveDirectAudio(audio);
  const streamed: Buffer[] = [];

  for await (const chunk of createYouTubeStream({ ...TRACK, audio: getAudioSource(videoInfo()) })) {
    streamed.push(chunk);
  }

  assert.equal(Buffer.concat(streamed).length, audio.length);
  assert.deepEqual(ranges, ["bytes=0-1048575", "bytes=1048576-2097151", "bytes=2097152-2621439"]);
});

test("createYouTubeStream falls back to yt-dlp when the direct link is refused", async (t) => {
  t.after(() => mock.restoreAll());
  serveDirectAudio(Buffer.alloc(10), 403);
  ytDlpStream = () => fakeSubprocess(["from ", "yt-dlp"], { exitCode: 0 });

  assert.equal(await collect(createYouTubeStream({ ...TRACK, audio: getAudioSource(videoInfo()) })), "from yt-dlp");
});

test("createYouTubeStream retries yt-dlp when it fails before any audio", async () => {
  const attempts: number[] = [];
  ytDlpStream = () => {
    attempts.push(attempts.length + 1);
    return attempts.length === 1 ? fakeSubprocess([], { exitCode: 1 }) : fakeSubprocess(["audio"], { exitCode: 0 });
  };

  assert.equal(await collect(createYouTubeStream(TRACK)), "audio");
  assert.deepEqual(attempts, [1, 2]);
});

test("createYouTubeStream kills yt-dlp when playback stops early", async () => {
  const process = fakeSubprocess(["a", "b", "c"], { exitCode: 0 });
  ytDlpStream = () => process;
  const stream = createYouTubeStream(TRACK);

  await new Promise((resolve) => stream.once("data", resolve));
  stream.destroy();
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(process.killed, true);
});

/** A fetch that answers with the given status, or fails, and records the URLs it was asked. */
function fakeFetch(result: number | Error) {
  const urls: string[] = [];
  const fetchFn = (async (url: string) => {
    urls.push(url);
    if (result instanceof Error) {
      throw result;
    }
    return new Response(result === 200 ? "{}" : null, { status: result });
  }) as unknown as typeof fetch;
  return { fetchFn, urls };
}

const VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

test("checkYouTubeVideo asks oEmbed and reports a video that works", async () => {
  const { fetchFn, urls } = fakeFetch(200);

  assert.equal(await checkYouTubeVideo(VIDEO_URL, fetchFn), "available");
  assert.deepEqual(urls, [`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(VIDEO_URL)}`]);
});

test("checkYouTubeVideo reports deleted, private, and not embeddable videos as unavailable", async () => {
  for (const status of [400, 401, 403, 404]) {
    assert.equal(await checkYouTubeVideo(VIDEO_URL, fakeFetch(status).fetchFn), "unavailable", String(status));
  }
});

test("checkYouTubeVideo reports server errors and network failures as unknown", async () => {
  assert.equal(await checkYouTubeVideo(VIDEO_URL, fakeFetch(500).fetchFn), "unknown");
  assert.equal(await checkYouTubeVideo(VIDEO_URL, fakeFetch(new Error("getaddrinfo ENOTFOUND")).fetchFn), "unknown");
});

// Runs last: once cookies are configured, every later yt-dlp call would send them.
test("useYouTubeCookies makes yt-dlp send a copy of the cookies file", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "zouve-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, "youtube.txt");
  await writeFile(file, "# Netscape HTTP Cookie File");

  ytDlpCalls.length = 0;
  ytDlpJson = () => ({ title: "Song", duration: 200 });
  await resolveYouTubeVideo("dQw4w9WgXcQ", "Ana");
  assert.equal("cookies" in (ytDlpCalls.at(-1)?.flags ?? {}), false);

  await useYouTubeCookies(file);
  await resolveYouTubeVideo("dQw4w9WgXcQ", "Ana");
  await resolveYouTubeList({ listId: "PLabc" }, "Ana").catch(() => undefined);

  const [, videoCall, listCall] = ytDlpCalls;
  const copy = videoCall?.flags.cookies;
  assert.equal(typeof copy, "string");
  assert.notEqual(copy, file);
  assert.equal(await readFile(String(copy), "utf8"), "# Netscape HTTP Cookie File");
  assert.equal(listCall?.flags.cookies, copy);
});

test("useYouTubeCookies fails when the cookies file cannot be read", async () => {
  await assert.rejects(useYouTubeCookies(join(tmpdir(), "zouve-missing-cookies.txt")), /Could not read the YouTube cookies file/);
});

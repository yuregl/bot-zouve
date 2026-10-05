import { Readable } from "node:stream";
import { youtubeDl } from "youtube-dl-exec";
import type { AudioSource, Track } from "../music/track.js";
import { type LinkResolver, type TrackResolver, UnsupportedTrackError } from "../music/track-resolver.js";
import { createLogger } from "./logger.js";

const logger = createLogger("youtube");

const VIDEO_ID_PATTERN = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);

// Opus in WebM can be sent to Discord without re-encoding, so FFmpeg is not needed.
const OPUS_WEBM_FORMAT = "bestaudio[acodec=opus][ext=webm]";

// YouTube resets connections that download a whole file in one request, so the audio is
// fetched in ranges, as yt-dlp does.
const DIRECT_CHUNK_BYTES = 1024 * 1024;

// A direct link this close to expiring is not used; yt-dlp resolves a fresh one instead.
const EXPIRY_MARGIN_MS = 60_000;

// yt-dlp attempts after the direct link fails, since YouTube occasionally rejects a
// download (HTTP 403) that succeeds when retried.
const YT_DLP_ATTEMPTS = 2;

const baseFlags = {
  noPlaylist: true,
  noWarnings: true,
  // yt-dlp needs a JavaScript runtime to extract YouTube formats; reuse the bot's Node.js.
  jsRuntimes: `node:${process.execPath}`,
} as const;

export function getYouTubeVideoId(query: string): string | undefined {
  let url: URL;
  try {
    url = new URL(query.trim());
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return undefined;
  }

  let id: string | null | undefined;
  if (url.hostname === "youtu.be") {
    id = url.pathname.slice(1);
  } else if (YOUTUBE_HOSTS.has(url.hostname)) {
    id = url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/shorts\/([^/]+)/)?.[1];
  }

  return id && VIDEO_ID_PATTERN.test(id) ? id : undefined;
}

export function isYouTubeUrl(query: string): boolean {
  return getYouTubeVideoId(query) !== undefined;
}

async function fetchVideoInfo(url: string) {
  const info = await youtubeDl(url, {
    ...baseFlags,
    dumpSingleJson: true,
    format: OPUS_WEBM_FORMAT,
  });

  if (typeof info === "string") {
    throw new Error("yt-dlp returned unexpected output.");
  }

  return info;
}

type VideoInfo = Awaited<ReturnType<typeof fetchVideoInfo>>;

function toTrack(info: VideoInfo, videoId: string, requestedBy: string): Track {
  return {
    title: info.title,
    url: watchUrl(videoId),
    durationSeconds: info.duration ?? 0,
    requestedBy,
    audio: getAudioSource(info),
  };
}

/** Resolves a YouTube video by its id. */
export async function resolveYouTubeVideo(videoId: string, requestedBy: string): Promise<Track> {
  logger.debug("Fetching video info", { videoId });
  const info = await fetchVideoInfo(watchUrl(videoId));

  if (info.is_live) {
    throw new UnsupportedTrackError("Live streams are not supported.");
  }

  return toTrack(info, videoId, requestedBy);
}

/** Resolves the first YouTube search result for the given terms. */
export async function searchYouTube(terms: string, requestedBy: string): Promise<Track> {
  logger.debug("Searching YouTube", { terms });
  const results = await fetchVideoInfo(`ytsearch1:${terms}`);
  const info = (results as { entries?: VideoInfo[] }).entries?.[0];

  if (!info) {
    throw new UnsupportedTrackError(`No YouTube results for "${terms}".`);
  }

  if (typeof info.id !== "string" || !VIDEO_ID_PATTERN.test(info.id)) {
    throw new Error("yt-dlp returned a video without a valid id.");
  }

  if (info.is_live) {
    throw new UnsupportedTrackError(`The first result for "${terms}" is a live stream, which is not supported.`);
  }

  return toTrack(info, info.id, requestedBy);
}

// Results compared when matching a track from another service by duration.
const DURATION_MATCH_CANDIDATES = 5;

interface SearchCandidate {
  id?: unknown;
  duration?: number | null;
  live_status?: string | null;
}

/**
 * Picks the candidate whose duration is closest to the target, preferring earlier results on
 * ties; without a target, picks the first candidate.
 */
export function pickClosestDuration<T extends { duration?: number | null }>(
  candidates: readonly T[],
  targetSeconds: number | undefined,
): T | undefined {
  if (targetSeconds === undefined) {
    return candidates[0];
  }

  let best: T | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = typeof candidate.duration === "number" ? Math.abs(candidate.duration - targetSeconds) : Number.POSITIVE_INFINITY;
    if (best === undefined || distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Finds the YouTube video for a track known from another service, such as Spotify: among
 * the first search results, the one whose duration is closest to the track's, which skips
 * live versions and music videos with long intros. Without a duration, the first result.
 */
export async function searchYouTubeByDuration(
  terms: string,
  durationSeconds: number | undefined,
  requestedBy: string,
): Promise<Track> {
  logger.debug("Searching YouTube by duration", { terms, durationSeconds });
  const results = await youtubeDl(`ytsearch${DURATION_MATCH_CANDIDATES}:${terms}`, {
    ...baseFlags,
    dumpSingleJson: true,
    flatPlaylist: true,
  });
  const entries = typeof results === "string" ? [] : ((results as { entries?: SearchCandidate[] }).entries ?? []);
  const candidates = entries.filter(
    (entry): entry is SearchCandidate & { id: string } =>
      typeof entry.id === "string" && VIDEO_ID_PATTERN.test(entry.id) && entry.live_status !== "is_live",
  );
  const match = pickClosestDuration(candidates, durationSeconds);

  if (!match) {
    throw new UnsupportedTrackError(`No YouTube results for "${terms}".`);
  }

  return resolveYouTubeVideo(match.id, requestedBy);
}

/** Plays a link to a single YouTube video. */
export const youtubeLinkResolver: LinkResolver = {
  linkDescription: "a single YouTube video",
  failureMessage: "Could not load this video. Check that the link is public and available.",
  canResolve: (url) => isYouTubeUrl(url.href),
  async resolve(query, requestedBy) {
    const videoId = getYouTubeVideoId(query);

    if (!videoId) {
      throw new UnsupportedTrackError("Send a valid YouTube video link.");
    }

    return [await resolveYouTubeVideo(videoId, requestedBy)];
  },
};

/** Plays the first YouTube result for any text that is not a link; the default for /play. */
export const youtubeSearchResolver: TrackResolver = {
  failureMessage: "Could not search YouTube right now. Try again.",
  async resolve(query, requestedBy) {
    return [await searchYouTube(query, requestedBy)];
  },
};

/**
 * Resolves a new direct audio link for a queued track whose link is missing or about to
 * expire. Failures are logged and leave the track as is; playback then falls back to yt-dlp.
 */
export async function refreshAudioSource(track: Track): Promise<void> {
  try {
    track.audio = getAudioSource(await fetchVideoInfo(track.url));
    logger.debug("Audio link refreshed", { url: track.url });
  } catch (error) {
    logger.warn("Could not refresh the audio link", { url: track.url }, error);
  }
}

/** Whether the track's direct audio link will not be usable at the given time. */
export function needsFreshAudio(track: Track, playAt: number): boolean {
  return !track.audio || track.audio.expiresAt - EXPIRY_MARGIN_MS <= playAt;
}

/** Extracts the direct audio link from yt-dlp's JSON output, if it has a usable one. */
export function getAudioSource(info: unknown): AudioSource | undefined {
  if (typeof info !== "object" || info === null) {
    return undefined;
  }

  const { url, protocol, http_headers: rawHeaders } = info as Record<string, unknown>;

  if (typeof url !== "string" || protocol !== "https") {
    return undefined;
  }

  let expiresAt: number;
  try {
    expiresAt = Number(new URL(url).searchParams.get("expire")) * 1000;
  } catch {
    return undefined;
  }

  if (!Number.isFinite(expiresAt) || expiresAt <= 0) {
    return undefined;
  }

  const headers: Record<string, string> = {};
  if (typeof rawHeaders === "object" && rawHeaders !== null) {
    for (const [name, value] of Object.entries(rawHeaders)) {
      if (typeof value === "string" || typeof value === "number") {
        headers[name] = String(value);
      }
    }
  }

  return { url, headers, expiresAt };
}

export interface AudioAttempt {
  name: string;
  open(signal: AbortSignal): AsyncIterable<Buffer>;
}

/**
 * Streams the track's audio, using the direct link resolved by /play when it is still
 * valid and falling back to yt-dlp. A source that fails before sending any audio is
 * replaced by the next one; a failure after audio started ends the stream.
 */
export function createYouTubeStream(track: Track): Readable {
  const attempts: AudioAttempt[] = [];
  const audio = track.audio;

  if (audio && !needsFreshAudio(track, Date.now())) {
    attempts.push({ name: "direct link", open: (signal) => readDirectAudio(audio, signal) });
  }
  for (let attempt = 1; attempt <= YT_DLP_ATTEMPTS; attempt++) {
    attempts.push({ name: `yt-dlp (attempt ${attempt})`, open: () => spawnYtDlpStream(track) });
  }

  return Readable.from(streamFirstWorkingAttempt(track, attempts));
}

export async function* streamFirstWorkingAttempt(track: Track, attempts: AudioAttempt[]): AsyncGenerator<Buffer> {
  const controller = new AbortController();

  try {
    for (const attempt of attempts) {
      let iterator: AsyncIterator<Buffer> | undefined;
      let first: IteratorResult<Buffer>;

      try {
        iterator = attempt.open(controller.signal)[Symbol.asyncIterator]();
        first = await iterator.next();
      } catch (error) {
        logger.warn("Audio source failed before playback; trying the next one", {
          url: track.url,
          source: attempt.name,
        }, error);
        await iterator?.return?.();
        continue;
      }

      if (first.done) {
        logger.warn("Audio source ended without audio; trying the next one", {
          url: track.url,
          source: attempt.name,
        });
        continue;
      }

      logger.debug("Streaming audio", { url: track.url, source: attempt.name });

      try {
        yield first.value;
        for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
          yield next.value;
        }
      } finally {
        await iterator.return?.();
      }
      return;
    }

    throw new Error("Could not stream audio from YouTube.");
  } finally {
    controller.abort();
  }
}

async function* readDirectAudio(audio: AudioSource, signal: AbortSignal): AsyncGenerator<Buffer> {
  let start = 0;
  let size: number | undefined;

  while (size === undefined || start < size) {
    const end = size === undefined ? start + DIRECT_CHUNK_BYTES - 1 : Math.min(start + DIRECT_CHUNK_BYTES, size) - 1;
    const response = await fetch(audio.url, {
      headers: { ...audio.headers, Range: `bytes=${start}-${end}` },
      signal,
    });

    // Without a partial response YouTube would send the whole file, which it resets midway.
    if (response.status !== 206) {
      await response.body?.cancel();
      throw new Error(`Direct audio request failed with HTTP ${response.status}.`);
    }

    size ??= parseContentRangeSize(response.headers.get("content-range"));
    const chunk = Buffer.from(await response.arrayBuffer());

    if (chunk.length === 0) {
      return;
    }

    yield chunk;
    start += chunk.length;

    if (size === undefined && chunk.length < DIRECT_CHUNK_BYTES) {
      return;
    }
  }
}

/** Reads the total size from a `Content-Range: bytes 0-1023/4096` header. */
export function parseContentRangeSize(header: string | null): number | undefined {
  const size = Number(header?.match(/\/(\d+)$/)?.[1]);
  return Number.isSafeInteger(size) && size > 0 ? size : undefined;
}

function spawnYtDlpStream(track: Track): Readable {
  const subprocess = youtubeDl.exec(
    track.url,
    { ...baseFlags, format: OPUS_WEBM_FORMAT, output: "-", quiet: true },
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  if (!subprocess.stdout) {
    subprocess.kill();
    throw new Error("yt-dlp did not provide an audio stream.");
  }

  const stream = subprocess.stdout;
  logger.debug("yt-dlp stream started", { url: track.url, pid: subprocess.pid });

  // tinyspawn copies the child process fields when it spawns, so subprocess.killed and
  // subprocess.exitCode never change; track the kill request ourselves instead.
  let stopRequested = false;

  subprocess.catch((error: unknown) => {
    if (isStoppedByPlayback(error, stopRequested)) {
      logger.debug("yt-dlp stopped because playback ended", { url: track.url });
      return;
    }
    logger.error("yt-dlp stream failed", { url: track.url }, error);
    stream.destroy(error instanceof Error ? error : new Error(String(error)));
  });
  stream.once("close", () => {
    stopRequested = true;
    subprocess.kill();
  });

  return stream;
}

/**
 * Whether yt-dlp exited because the bot killed it after playback stopped early
 * (stop, leave, or skip), as opposed to failing on its own.
 */
export function isStoppedByPlayback(error: unknown, stopRequested: boolean): boolean {
  return (
    stopRequested &&
    typeof error === "object" &&
    error !== null &&
    "signalCode" in error &&
    error.signalCode === "SIGTERM"
  );
}

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

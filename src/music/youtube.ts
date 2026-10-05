import type { Readable } from "node:stream";
import { youtubeDl } from "youtube-dl-exec";
import type { Track } from "./track.js";
import { createLogger } from "../logger.js";

const logger = createLogger("youtube");

const VIDEO_ID_PATTERN = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);

// Opus in WebM can be sent to Discord without re-encoding, so FFmpeg is not needed.
const OPUS_WEBM_FORMAT = "bestaudio[acodec=opus][ext=webm]";

const baseFlags = {
  noPlaylist: true,
  noWarnings: true,
  // yt-dlp needs a JavaScript runtime to extract YouTube formats; reuse the bot's Node.js.
  jsRuntimes: `node:${process.execPath}`,
} as const;

export class UnsupportedTrackError extends Error {}

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

export async function resolveYouTubeTrack(query: string, requestedBy: string): Promise<Track> {
  const videoId = getYouTubeVideoId(query);

  if (!videoId) {
    throw new UnsupportedTrackError("Send a valid YouTube video link.");
  }

  logger.debug("Fetching video info", { videoId });
  const info = await youtubeDl(watchUrl(videoId), {
    ...baseFlags,
    dumpSingleJson: true,
    format: OPUS_WEBM_FORMAT,
  });

  if (typeof info === "string") {
    throw new Error("yt-dlp returned unexpected output.");
  }

  if (info.is_live) {
    throw new UnsupportedTrackError("Live streams are not supported.");
  }

  return {
    title: info.title,
    url: watchUrl(videoId),
    durationSeconds: info.duration ?? 0,
    requestedBy,
  };
}

export function createYouTubeStream(track: Track): Readable {
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

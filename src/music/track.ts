/** Direct link to a track's audio, resolved by yt-dlp and valid until it expires. */
export interface AudioSource {
  url: string;
  headers: Record<string, string>;
  /** Epoch milliseconds after which YouTube rejects the link. */
  expiresAt: number;
}

export interface Track {
  title: string;
  url: string;
  durationSeconds: number;
  requestedBy: string;
  audio?: AudioSource;
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * Parses a position as shown on YouTube's player, `m:ss` or `h:mm:ss` (for example `2:13`
 * or `1:02:30`), into seconds. Returns undefined for anything else.
 */
export function parseTimestamp(text: string): number | undefined {
  const match = text.trim().match(/^(?:(\d+):([0-5]\d)|(\d+)):([0-5]\d)$/);

  if (!match) {
    return undefined;
  }

  const [, hours, minutesAfterHours, minutes, seconds] = match;
  return hours !== undefined
    ? Number(hours) * 3600 + Number(minutesAfterHours) * 60 + Number(seconds)
    : Number(minutes) * 60 + Number(seconds);
}

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "--:--";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

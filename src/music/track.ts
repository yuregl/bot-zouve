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

export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "--:--";
  }

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

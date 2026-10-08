/** How long the bot waits before acting on inactivity, in milliseconds. */
export interface Timeouts {
  /** Nothing playing or queued before the bot leaves the voice channel. */
  idleMs: number;
  /** No one but bots in the voice channel before the bot leaves it. */
  aloneMs: number;
  /** How long a vote to skip stays open. */
  skipVoteMs: number;
}

export const DEFAULT_TIMEOUTS: Timeouts = {
  idleMs: 5 * 60_000,
  aloneMs: 3 * 60_000,
  skipVoteMs: 60_000,
};

const TIMEOUT_VARIABLES: Record<keyof Timeouts, string> = {
  idleMs: "IDLE_TIMEOUT_SECONDS",
  aloneMs: "ALONE_TIMEOUT_SECONDS",
  skipVoteMs: "SKIP_VOTE_TIMEOUT_SECONDS",
};

/**
 * Reads the timeouts from environment variables in seconds; unset or empty variables keep
 * the defaults. Throws when a variable is not a whole number of seconds above zero.
 */
export function readTimeouts(env: NodeJS.ProcessEnv = process.env): Timeouts {
  const timeouts = { ...DEFAULT_TIMEOUTS };

  for (const [key, name] of Object.entries(TIMEOUT_VARIABLES) as [keyof Timeouts, string][]) {
    const raw = env[name]?.trim();

    if (!raw) {
      continue;
    }

    const seconds = Number(raw);
    if (!Number.isSafeInteger(seconds) || seconds <= 0) {
      throw new Error(`${name} must be a whole number of seconds greater than zero; got "${raw}".`);
    }

    timeouts[key] = seconds * 1000;
  }

  return timeouts;
}

/** Writes a duration for users, like "5 minutes", "1 minute 30 seconds", or "45 seconds". */
export function describeDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  }
  if (seconds > 0 || minutes === 0) {
    parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  }

  return parts.join(" ");
}

/** A time of day, like 09:00. */
export interface TimeOfDay {
  hour: number;
  minute: number;
}

export const DEFAULT_ANNOUNCE_TIME: TimeOfDay = { hour: 9, minute: 0 };

/**
 * Reads the time birthdays are announced from `BIRTHDAY_ANNOUNCE_TIME`, written as `HH:MM`;
 * unset or empty keeps 09:00. Throws when the value is not a valid time.
 */
export function readAnnounceTime(env: NodeJS.ProcessEnv = process.env): TimeOfDay {
  const raw = env.BIRTHDAY_ANNOUNCE_TIME?.trim();

  if (!raw) {
    return DEFAULT_ANNOUNCE_TIME;
  }

  const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) {
    throw new Error(`BIRTHDAY_ANNOUNCE_TIME must be a time written as HH:MM, like 09:00; got "${raw}".`);
  }

  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** Reads the path of the YouTube cookies file from `YOUTUBE_COOKIES_FILE`; unset or empty means no cookies. */
export function readYouTubeCookiesFile(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.YOUTUBE_COOKIES_FILE?.trim() || undefined;
}

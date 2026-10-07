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

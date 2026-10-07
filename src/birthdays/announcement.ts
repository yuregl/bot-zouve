import type { BirthdayContent } from "./birthday-content.js";

export type BirthdayVideo = Extract<BirthdayContent, { type: "video" }>;
export type BirthdayMessage = Extract<BirthdayContent, { type: "message" }>;

/** Whether a video can be shown, as a check reports it; "unknown" says nothing about the video. */
export type VideoAvailability = "available" | "unavailable" | "unknown";

/** Used when the server's collection has no messages. */
export const DEFAULT_BIRTHDAY_MESSAGE = "Wishing you a fantastic day, full of joy and cake! 🎁";

export interface Announcement {
  content: string;
  /** Only the birthday member can be notified, whatever the collection's text says. */
  allowedMentions: { users: string[] };
}

/** The congratulation for a member: a greeting that mentions them, a message, and a video link. */
export function buildAnnouncement(userId: string, message: string | undefined, videoUrl: string | undefined): Announcement {
  const parts = [`🎉🎂 Happy birthday, <@${userId}>! 🥳🎈`, message ?? DEFAULT_BIRTHDAY_MESSAGE];

  if (videoUrl) {
    parts.push(videoUrl);
  }

  return { content: parts.join("\n\n"), allowedMentions: { users: [userId] } };
}

/** Picks an item at random; undefined for an empty list. */
export function pickRandom<T>(items: readonly T[], random: () => number = Math.random): T | undefined {
  return items[Math.floor(random() * items.length)];
}

/** Returns the items in random order (Fisher–Yates), without changing the original. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
}

/**
 * Checks videos in random order and returns the first that works. Every video whose
 * availability changed is recorded: broken ones as unavailable, and previously unavailable
 * ones that work again as available. Videos that cannot be checked are skipped.
 */
export async function pickWorkingVideo(
  videos: readonly BirthdayVideo[],
  check: (videoUrl: string) => Promise<VideoAvailability>,
  record: (video: BirthdayVideo, available: boolean) => Promise<void>,
  random: () => number = Math.random,
): Promise<BirthdayVideo | undefined> {
  for (const video of shuffle(videos, random)) {
    const availability = await check(video.videoUrl);

    if (availability === "available") {
      if (video.unavailable) {
        await record(video, true);
      }
      return video;
    }

    if (availability === "unavailable" && !video.unavailable) {
      await record(video, false);
    }
  }

  return undefined;
}

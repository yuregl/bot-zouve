import type { MessageCreateOptions } from "discord.js";
import { type BirthdayMessage, type BirthdayVideo, buildAnnouncement, pickRandom, pickWorkingVideo, type VideoAvailability } from "./announcement.js";
import { BIRTHDAY_TIME_ZONE, type BirthdayRepository, clockIn, daysUntilBirthday, isoDay } from "./birthday.js";
import type { BirthdayContent, BirthdayContentRepository } from "./birthday-content.js";
import type { TimeOfDay } from "../infra/config.js";
import { createLogger } from "../infra/logger.js";

const logger = createLogger("birthday-announcer");

/** How often the announcer checks for birthdays to congratulate. */
export const ANNOUNCE_INTERVAL_MS = 5 * 60_000;

/** A server as the announcer sees it: where to send, if the bot can. */
export interface AnnouncerGuild {
  id: string;
  name: string;
  /** The `#zouve-music` channel, or undefined when the server has none. */
  channel?: { send(options: MessageCreateOptions): Promise<unknown> };
}

export interface AnnouncerDependencies {
  birthdays: BirthdayRepository;
  content: BirthdayContentRepository;
  checkVideo: (videoUrl: string) => Promise<VideoAvailability>;
  isDatabaseReady: () => boolean;
  announceTime: TimeOfDay;
  now?: () => Date;
  random?: () => number;
}

/**
 * Congratulates every member whose birthday is today, once the announce time is reached.
 * Each member is claimed before sending, so they are congratulated once even across runs
 * and restarts; a failed send releases the claim to try again on the next run. Returns how
 * many congratulations were sent.
 */
export async function announceBirthdays(guilds: readonly AnnouncerGuild[], dependencies: AnnouncerDependencies): Promise<number> {
  if (!dependencies.isDatabaseReady()) {
    return 0;
  }

  const clock = clockIn(BIRTHDAY_TIME_ZONE, dependencies.now?.() ?? new Date());
  const { hour, minute } = dependencies.announceTime;

  if (clock.hour * 60 + clock.minute < hour * 60 + minute) {
    return 0;
  }

  const today = isoDay(clock);
  let sent = 0;

  for (const guild of guilds) {
    let due;
    try {
      due = (await dependencies.birthdays.list(guild.id)).filter((birthday) => daysUntilBirthday(birthday, clock) === 0);
    } catch (error) {
      logger.error("Could not read today's birthdays", { guild: guild.name }, error);
      continue;
    }

    if (due.length === 0) {
      continue;
    }

    const channel = guild.channel;
    if (!channel) {
      logger.warn("Birthdays today, but the server has no #zouve-music channel", { guild: guild.name, members: due.length });
      continue;
    }

    const content = await readContent(guild, dependencies);

    for (const birthday of due) {
      if (await congratulate(guild, channel, birthday.userId, today, content, dependencies)) {
        sent++;
      }
    }
  }

  return sent;
}

async function readContent(guild: AnnouncerGuild, dependencies: AnnouncerDependencies): Promise<BirthdayContent[]> {
  try {
    return await dependencies.content.list(guild.id);
  } catch (error) {
    // Congratulate anyway, with the default message and no video.
    logger.error("Could not read the birthday collection", { guild: guild.name }, error);
    return [];
  }
}

async function congratulate(
  guild: AnnouncerGuild,
  channel: NonNullable<AnnouncerGuild["channel"]>,
  userId: string,
  today: string,
  content: readonly BirthdayContent[],
  dependencies: AnnouncerDependencies,
): Promise<boolean> {
  let claim;
  try {
    claim = await dependencies.birthdays.claimAnnouncement(guild.id, userId, today);
  } catch (error) {
    logger.error("Could not claim the birthday announcement", { guild: guild.name, user: userId }, error);
    return false;
  }

  // Already congratulated today, by an earlier run.
  if (!claim) {
    return false;
  }

  try {
    const messages = content.filter((item): item is BirthdayMessage => item.type === "message");
    const videos = content.filter((item): item is BirthdayVideo => item.type === "video");
    const message = pickRandom(messages, dependencies.random);
    const video = await pickWorkingVideo(videos, dependencies.checkVideo, (checked, available) => recordAvailability(guild, checked, available, dependencies), dependencies.random);

    await channel.send(buildAnnouncement(userId, message?.text, video?.videoUrl));
    logger.info("Birthday congratulated", { guild: guild.name, user: userId, video: video?.videoUrl });
    return true;
  } catch (error) {
    logger.error("Could not send the birthday congratulation; trying again later", { guild: guild.name, user: userId }, error);
    await dependencies.birthdays
      .releaseAnnouncement(guild.id, userId, today, claim)
      .catch((releaseError: unknown) => logger.error("Could not release the birthday announcement", { guild: guild.name, user: userId }, releaseError));
    return false;
  }
}

async function recordAvailability(guild: AnnouncerGuild, video: BirthdayVideo, available: boolean, dependencies: AnnouncerDependencies): Promise<void> {
  logger.info(available ? "Birthday video works again" : "Birthday video is unavailable", { guild: guild.name, url: video.videoUrl });
  try {
    await dependencies.content.setVideoAvailability(guild.id, video.id, available);
  } catch (error) {
    logger.error("Could not record the video's availability", { guild: guild.name, url: video.videoUrl }, error);
  }
}

/**
 * Runs the announcer now and every ANNOUNCE_INTERVAL_MS, skipping a run while the previous
 * one is still going. Returns a function that stops it.
 */
export function startBirthdayAnnouncer(
  getGuilds: () => AnnouncerGuild[],
  dependencies: AnnouncerDependencies,
  intervalMs = ANNOUNCE_INTERVAL_MS,
): () => void {
  let running = false;

  const run = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      await announceBirthdays(getGuilds(), dependencies);
    } catch (error) {
      logger.error("Birthday announcer run failed", undefined, error);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  return () => clearInterval(timer);
}

import assert from "node:assert/strict";
import { test } from "node:test";
import type { MessageCreateOptions } from "discord.js";
import type { VideoAvailability } from "../../src/birthdays/announcement.js";
import {
  ANNOUNCE_INTERVAL_MS,
  announceBirthdays,
  type AnnouncerDependencies,
  type AnnouncerGuild,
  startBirthdayAnnouncer,
} from "../../src/birthdays/birthday-announcer.js";
import type { AnnouncementClaim, BirthdayEntry } from "../../src/birthdays/birthday.js";
import type { BirthdayContent } from "../../src/birthdays/birthday-content.js";

// 24/08/2026 at 09:00 in São Paulo (UTC-3).
const AT_NINE = new Date("2026-08-24T12:00:00Z");
const BEFORE_NINE = new Date("2026-08-24T11:59:00Z");

const BIRTHDAYS: BirthdayEntry[] = [
  { userId: "ana", username: "ana", day: 24, month: 8 },
  { userId: "bia", username: "bia", day: 24, month: 8 },
  { userId: "caio", username: "caio", day: 25, month: 8 },
];

function video(id: string, unavailable = false): BirthdayContent {
  return { id, guildId: "guild", addedBy: "admin", createdAt: new Date(), type: "video", videoId: id, videoUrl: `https://youtu.be/${id}`, unavailable };
}

const MESSAGE: BirthdayContent = { id: "m1", guildId: "guild", addedBy: "admin", createdAt: new Date(), type: "message", text: "С днём рождения!" };

interface Options {
  now?: Date;
  birthdays?: BirthdayEntry[] | Error;
  content?: BirthdayContent[] | Error;
  videos?: Record<string, VideoAvailability>;
  databaseReady?: boolean;
  /** Fail the first n sends. */
  failSends?: number;
  claimError?: boolean;
  releaseError?: boolean;
  availabilityError?: boolean;
  noChannel?: boolean;
}

/** A guild, repositories that keep the announcement claims in memory, and a channel that records messages. */
function setup(options: Options = {}) {
  const sent: MessageCreateOptions[] = [];
  const claims = new Map<string, string>();
  const availability: [string, boolean][] = [];
  let failures = options.failSends ?? 0;

  const guild: AnnouncerGuild = {
    id: "guild",
    name: "Test guild",
    channel: options.noChannel
      ? undefined
      : {
          send: async (message) => {
            if (failures > 0) {
              failures--;
              throw new Error("Missing Permissions");
            }
            sent.push(message);
          },
        },
  };

  const dependencies: AnnouncerDependencies = {
    birthdays: {
      save: async () => "created",
      list: async () => {
        if (options.birthdays instanceof Error) {
          throw options.birthdays;
        }
        return options.birthdays ?? BIRTHDAYS;
      },
      claimAnnouncement: async (_guildId, userId, today): Promise<AnnouncementClaim | undefined> => {
        if (options.claimError) {
          throw new Error("connection closed");
        }
        if (claims.get(userId) === today) {
          return undefined;
        }
        const previous = claims.get(userId);
        claims.set(userId, today);
        return { previous };
      },
      releaseAnnouncement: async (_guildId, userId, _today, claim) => {
        if (options.releaseError) {
          throw new Error("connection closed");
        }
        if (claim.previous === undefined) {
          claims.delete(userId);
        } else {
          claims.set(userId, claim.previous);
        }
      },
    },
    content: {
      add: async () => "added",
      list: async () => {
        if (options.content instanceof Error) {
          throw options.content;
        }
        return options.content ?? [MESSAGE, video("v1")];
      },
      remove: async () => true,
      setVideoAvailability: async (_guildId, id, available) => {
        if (options.availabilityError) {
          throw new Error("connection closed");
        }
        availability.push([id, available]);
      },
    },
    checkVideo: async (url) => options.videos?.[url.slice(-2)] ?? "available",
    isDatabaseReady: () => options.databaseReady ?? true,
    announceTime: { hour: 9, minute: 0 },
    now: () => options.now ?? AT_NINE,
    random: () => 0.999,
  };

  return { run: () => announceBirthdays([guild], dependencies), sent, claims, availability, guild, dependencies };
}

test("at the announce time, each member with a birthday today gets their own message", async () => {
  const { run, sent } = setup();

  assert.equal(await run(), 2);

  assert.deepEqual(
    sent.map((message) => message.content),
    [
      "🎉🎂 Happy birthday, <@ana>! 🥳🎈\n\nС днём рождения!\n\nhttps://youtu.be/v1",
      "🎉🎂 Happy birthday, <@bia>! 🥳🎈\n\nС днём рождения!\n\nhttps://youtu.be/v1",
    ],
  );
  assert.deepEqual(sent[0]?.allowedMentions, { users: ["ana"] });
});

test("nothing is sent before the announce time", async () => {
  const { run, sent } = setup({ now: BEFORE_NINE });

  assert.equal(await run(), 0);
  assert.deepEqual(sent, []);
});

test("a member is congratulated once a day, even when the announcer runs again", async () => {
  const { run, sent } = setup();

  await run();
  // Runs later the same day, as after a restart.
  assert.equal(await run(), 0);

  assert.equal(sent.length, 2);
});

test("a congratulation that fails to send is released and sent on a later run", async () => {
  const { run, sent, claims } = setup({ failSends: 1 });

  assert.equal(await run(), 1);
  assert.equal(claims.has("ana"), false);

  assert.equal(await run(), 1);
  assert.deepEqual(
    sent.map((message) => message.allowedMentions),
    [{ users: ["bia"] }, { users: ["ana"] }],
  );
});

test("a broken video is marked unavailable and another one is sent", async () => {
  const { run, sent, availability } = setup({
    birthdays: [BIRTHDAYS[0] as BirthdayEntry],
    content: [MESSAGE, video("v1"), video("v2")],
    videos: { v1: "unavailable" },
  });

  await run();

  assert.deepEqual(availability, [["v1", false]]);
  assert.match(String(sent[0]?.content), /https:\/\/youtu\.be\/v2$/);
});

test("without working videos or messages, the default congratulation is sent without a video", async () => {
  const { run, sent } = setup({ birthdays: [BIRTHDAYS[0] as BirthdayEntry], content: [video("v1", true)], videos: { v1: "unavailable" } });

  await run();

  assert.equal(sent[0]?.content, "🎉🎂 Happy birthday, <@ana>! 🥳🎈\n\nWishing you a fantastic day, full of joy and cake! 🎁");
});

test("the collection failing still sends the default congratulation", async () => {
  const { run, sent } = setup({ birthdays: [BIRTHDAYS[0] as BirthdayEntry], content: new Error("connection closed") });

  await run();

  assert.equal(sent.length, 1);
});

test("a failure to record a video's availability does not stop the congratulation", async () => {
  const { run, sent } = setup({
    birthdays: [BIRTHDAYS[0] as BirthdayEntry],
    content: [video("v1"), video("v2")],
    videos: { v1: "unavailable" },
    availabilityError: true,
  });

  await run();

  assert.match(String(sent[0]?.content), /v2$/);
});

test("servers without the channel, with unreadable birthdays, or with the database down are skipped", async () => {
  for (const options of [{ noChannel: true }, { birthdays: new Error("connection closed") }, { databaseReady: false }, { claimError: true }]) {
    const { run, sent } = setup(options);

    assert.equal(await run(), 0);
    assert.deepEqual(sent, []);
  }
});

test("a failure to release a claim is logged without stopping the run", async () => {
  const { run } = setup({ failSends: 2, releaseError: true });

  assert.equal(await run(), 0);
});

test("29/02 birthdays are congratulated on 28/02 outside leap years", async () => {
  const { run, sent } = setup({
    now: new Date("2027-02-28T12:00:00Z"),
    birthdays: [{ userId: "leap", username: "leap", day: 29, month: 2 }],
  });

  await run();

  assert.equal(sent.length, 1);
});

test("startBirthdayAnnouncer runs now and on every interval, and stops", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const { dependencies, guild } = setup({ now: BEFORE_NINE });
  let runs = 0;
  const counted: AnnouncerDependencies = {
    ...dependencies,
    isDatabaseReady: () => {
      runs++;
      return true;
    },
  };

  const stop = startBirthdayAnnouncer(() => [guild], counted);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(ANNOUNCE_INTERVAL_MS);
  await new Promise((resolve) => setImmediate(resolve));
  stop();
  t.mock.timers.tick(ANNOUNCE_INTERVAL_MS);

  assert.equal(runs, 2);
});

test("startBirthdayAnnouncer skips a run while the previous one is going, and survives failures", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  const { dependencies } = setup();
  let calls = 0;

  const stop = startBirthdayAnnouncer(() => {
    calls++;
    if (calls === 2) {
      throw new Error("guilds unavailable");
    }
    return [];
  }, dependencies);
  // The first run is still going: this tick is skipped.
  t.mock.timers.tick(ANNOUNCE_INTERVAL_MS);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(ANNOUNCE_INTERVAL_MS);
  await new Promise((resolve) => setImmediate(resolve));
  t.mock.timers.tick(ANNOUNCE_INTERVAL_MS);
  await new Promise((resolve) => setImmediate(resolve));
  stop();

  assert.ok(calls >= 2);
});

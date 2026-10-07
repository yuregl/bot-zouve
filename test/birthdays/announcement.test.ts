import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type BirthdayVideo,
  buildAnnouncement,
  DEFAULT_BIRTHDAY_MESSAGE,
  pickRandom,
  pickWorkingVideo,
  shuffle,
  type VideoAvailability,
} from "../../src/birthdays/announcement.js";

test("buildAnnouncement mentions the member and adds the message and the video", () => {
  assert.deepEqual(buildAnnouncement("ana", "С днём рождения!", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"), {
    content: "🎉🎂 Happy birthday, <@ana>! 🥳🎈\n\nС днём рождения!\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ",
    allowedMentions: { users: ["ana"] },
  });
});

test("buildAnnouncement uses the default message and leaves out a missing video", () => {
  assert.equal(buildAnnouncement("ana", undefined, undefined).content, `🎉🎂 Happy birthday, <@ana>! 🥳🎈\n\n${DEFAULT_BIRTHDAY_MESSAGE}`);
});

test("buildAnnouncement only allows notifying the birthday member", () => {
  // Discord only notifies the users listed in allowedMentions, so @everyone in the text stays plain.
  assert.deepEqual(buildAnnouncement("ana", "Parabéns @everyone <@&123> <@bia>", undefined).allowedMentions, { users: ["ana"] });
});

test("pickRandom and shuffle use the given randomness", () => {
  assert.equal(pickRandom(["a", "b", "c"], () => 0.99), "c");
  assert.equal(pickRandom([], () => 0), undefined);
  // With 0, every step swaps with the first position.
  assert.deepEqual(shuffle([1, 2, 3], () => 0), [2, 3, 1]);
  const original = [1, 2, 3];
  shuffle(original, () => 0.5);
  assert.deepEqual(original, [1, 2, 3]);
});

function video(id: string, unavailable = false): BirthdayVideo {
  return {
    id,
    guildId: "guild",
    addedBy: "admin",
    createdAt: new Date(),
    type: "video",
    videoId: id,
    videoUrl: `https://www.youtube.com/watch?v=${id}`,
    unavailable,
  };
}

/** Checks that answer from a table and record what was asked; records availability changes. */
function checker(results: Record<string, VideoAvailability>) {
  const checked: string[] = [];
  const recorded: [string, boolean][] = [];
  return {
    checked,
    recorded,
    check: async (url: string) => {
      const id = url.slice(-1);
      checked.push(id);
      return results[id] ?? "available";
    },
    record: async (picked: BirthdayVideo, available: boolean) => {
      recorded.push([picked.id, available]);
    },
  };
}

// Keeps the original order: each step swaps an item with itself.
const KEEP_ORDER = () => 0.999;

test("pickWorkingVideo returns the first video that works and marks broken ones unavailable", async () => {
  const { check, record, checked, recorded } = checker({ a: "unavailable", b: "available" });

  const picked = await pickWorkingVideo([video("a"), video("b"), video("c")], check, record, KEEP_ORDER);

  assert.equal(picked?.id, "b");
  assert.deepEqual(checked, ["a", "b"]);
  assert.deepEqual(recorded, [["a", false]]);
});

test("pickWorkingVideo marks a video available again when it works", async () => {
  const { check, record, recorded } = checker({ a: "available" });

  assert.equal((await pickWorkingVideo([video("a", true)], check, record, KEEP_ORDER))?.id, "a");
  assert.deepEqual(recorded, [["a", true]]);
});

test("pickWorkingVideo skips videos it cannot check, without marking them", async () => {
  const { check, record, recorded } = checker({ a: "unknown", b: "unavailable" });

  assert.equal(await pickWorkingVideo([video("a"), video("b", true)], check, record, KEEP_ORDER), undefined);
  // b was already marked unavailable, so nothing changed.
  assert.deepEqual(recorded, []);
});

test("pickWorkingVideo returns undefined without videos", async () => {
  const { check, record } = checker({});

  assert.equal(await pickWorkingVideo([], check, record), undefined);
});

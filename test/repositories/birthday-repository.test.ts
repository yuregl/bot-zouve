import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type BirthdayStore,
  createBirthdayRepository,
  mongooseBirthdayStore,
  type StoredBirthday,
  toBirthdayEntry,
  toDocumentUpdate,
} from "../../src/repositories/birthday-repository.js";

/** A store that records what the repository asks of it, without a database. */
function fakeStore(options: { updatedExisting?: boolean; documents?: StoredBirthday[]; before?: StoredBirthday | null } = {}) {
  const calls: { method: string; args: unknown[] }[] = [];
  const store: BirthdayStore = {
    upsert: async (filter, update) => {
      calls.push({ method: "upsert", args: [filter, update] });
      return options.updatedExisting === undefined ? null : { lastErrorObject: { updatedExisting: options.updatedExisting } };
    },
    findByGuild: async (guildId) => {
      calls.push({ method: "findByGuild", args: [guildId] });
      return options.documents ?? [];
    },
    findOneAndUpdate: async (filter, update) => {
      calls.push({ method: "findOneAndUpdate", args: [filter, update] });
      return options.before ?? null;
    },
    updateOne: async (filter, update) => {
      calls.push({ method: "updateOne", args: [filter, update] });
    },
  };
  return { store, calls };
}

const BIRTHDAY = {
  guildId: "guild",
  userId: "ana",
  username: "ana.silva",
  setBy: "admin",
  day: 24,
  month: 8,
};

test("toDocumentUpdate stores a date with a year as birthDate at midnight UTC", () => {
  assert.deepEqual(toDocumentUpdate({ ...BIRTHDAY, year: 1994 }), {
    $set: { username: "ana.silva", setBy: "admin", birthDate: new Date("1994-08-24T00:00:00.000Z") },
    $unset: { day: 1, month: 1 },
  });
});

test("toDocumentUpdate stores a date without a year as day and month", () => {
  assert.deepEqual(toDocumentUpdate(BIRTHDAY), {
    $set: { username: "ana.silva", setBy: "admin", day: 24, month: 8 },
    $unset: { birthDate: 1 },
  });
});

test("save creates or replaces the member's birthday in the server", async () => {
  const { store, calls } = fakeStore({ updatedExisting: false });

  assert.equal(await createBirthdayRepository(store).save(BIRTHDAY), "created");

  assert.deepEqual(calls, [{ method: "upsert", args: [{ guildId: "guild", userId: "ana" }, toDocumentUpdate(BIRTHDAY)] }]);
});

test("save reports a replaced birthday", async () => {
  assert.equal(await createBirthdayRepository(fakeStore({ updatedExisting: true }).store).save(BIRTHDAY), "updated");
});

test("save reports a new birthday when the database returns no metadata", async () => {
  assert.equal(await createBirthdayRepository(fakeStore().store).save(BIRTHDAY), "created");
});

test("list reads the day and month of both stored forms, skipping documents without a date", async () => {
  const { store, calls } = fakeStore({
    documents: [
      { userId: "ana", username: "ana.silva", birthDate: new Date("1994-08-24T00:00:00.000Z") },
      { userId: "bia", username: "bia", day: 15, month: 3 },
      { userId: "caio", username: "caio" },
    ],
  });

  const entries = await createBirthdayRepository(store).list("guild");

  assert.deepEqual(calls, [{ method: "findByGuild", args: ["guild"] }]);
  assert.deepEqual(entries, [
    { userId: "ana", username: "ana.silva", day: 24, month: 8 },
    { userId: "bia", username: "bia", day: 15, month: 3 },
  ]);
});

test("toBirthdayEntry reads birthDate in UTC, so the day does not shift with the time zone", () => {
  assert.deepEqual(toBirthdayEntry({ userId: "ana", username: "ana", birthDate: new Date("2000-01-01T00:00:00.000Z") }), {
    userId: "ana",
    username: "ana",
    day: 1,
    month: 1,
  });
});

test("claimAnnouncement marks today atomically and returns the previous date", async () => {
  const { store, calls } = fakeStore({ before: { userId: "ana", username: "ana", lastAnnouncedOn: "2025-08-24" } });

  assert.deepEqual(await createBirthdayRepository(store).claimAnnouncement("guild", "ana", "2026-08-24"), { previous: "2025-08-24" });
  assert.deepEqual(calls, [
    {
      method: "findOneAndUpdate",
      args: [{ guildId: "guild", userId: "ana", lastAnnouncedOn: { $ne: "2026-08-24" } }, { $set: { lastAnnouncedOn: "2026-08-24" } }],
    },
  ]);
});

test("claimAnnouncement returns undefined when today was already claimed", async () => {
  assert.equal(await createBirthdayRepository(fakeStore({ before: null }).store).claimAnnouncement("guild", "ana", "2026-08-24"), undefined);
});

test("claimAnnouncement of a first congratulation has no previous date", async () => {
  const { store } = fakeStore({ before: { userId: "ana", username: "ana" } });

  assert.deepEqual(await createBirthdayRepository(store).claimAnnouncement("guild", "ana", "2026-08-24"), { previous: undefined });
});

test("releaseAnnouncement restores the previous date, or removes it", async () => {
  const restore = fakeStore();
  const remove = fakeStore();

  await createBirthdayRepository(restore.store).releaseAnnouncement("guild", "ana", "2026-08-24", { previous: "2025-08-24" });
  await createBirthdayRepository(remove.store).releaseAnnouncement("guild", "ana", "2026-08-24", {});

  const filter = { guildId: "guild", userId: "ana", lastAnnouncedOn: "2026-08-24" };
  assert.deepEqual(restore.calls, [{ method: "updateOne", args: [filter, { $set: { lastAnnouncedOn: "2025-08-24" } }] }]);
  assert.deepEqual(remove.calls, [{ method: "updateOne", args: [filter, { $unset: { lastAnnouncedOn: 1 } }] }]);
});

test("the Mongoose store fails at once while the database is not connected", async () => {
  await assert.rejects(mongooseBirthdayStore.upsert({ guildId: "guild" }, { $set: {} }));
  await assert.rejects(mongooseBirthdayStore.findByGuild("guild"));
  await assert.rejects(mongooseBirthdayStore.findOneAndUpdate({ guildId: "guild" }, { $set: {} }));
  await assert.rejects(mongooseBirthdayStore.updateOne({ guildId: "guild" }, { $set: {} }));
});

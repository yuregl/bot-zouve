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
function fakeStore(options: { updatedExisting?: boolean; documents?: StoredBirthday[] } = {}) {
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

test("the Mongoose store fails at once while the database is not connected", async () => {
  await assert.rejects(mongooseBirthdayStore.upsert({ guildId: "guild" }, { $set: {} }));
  await assert.rejects(mongooseBirthdayStore.findByGuild("guild"));
});

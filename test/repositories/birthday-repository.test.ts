import assert from "node:assert/strict";
import { test } from "node:test";
import { createBirthdayRepository, toDocumentUpdate } from "../../src/repositories/birthday-repository.js";

/** A model that records what the repository asks of it, without a database. */
function fakeStore(updatedExisting: boolean | undefined) {
  const calls: { filter: object; update: object; options: object }[] = [];
  const store = {
    findOneAndUpdate: async (filter: object, update: object, options: object) => {
      calls.push({ filter, update, options });
      return updatedExisting === undefined ? null : { lastErrorObject: { updatedExisting } };
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
  const { store, calls } = fakeStore(false);

  assert.equal(await createBirthdayRepository(store).save(BIRTHDAY), "created");

  assert.deepEqual(calls, [
    {
      filter: { guildId: "guild", userId: "ana" },
      update: toDocumentUpdate(BIRTHDAY),
      options: { upsert: true, runValidators: true, includeResultMetadata: true },
    },
  ]);
});

test("save reports a replaced birthday", async () => {
  assert.equal(await createBirthdayRepository(fakeStore(true).store).save(BIRTHDAY), "updated");
});

test("save reports a new birthday when the database returns no metadata", async () => {
  assert.equal(await createBirthdayRepository(fakeStore(undefined).store).save(BIRTHDAY), "created");
});

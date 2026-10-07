import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type BirthdayContentStore,
  createBirthdayContentRepository,
  mongooseContentStore,
  type StoredContent,
  toBirthdayContent,
} from "../../src/repositories/birthday-content-repository.js";

const CREATED = new Date("2026-10-07T12:00:00Z");

function stored(id: string, fields: Partial<StoredContent>): StoredContent {
  return { _id: { toString: () => id }, guildId: "guild", type: "message", addedBy: "admin", createdAt: CREATED, ...fields };
}

/** A store that records calls instead of using a database. */
function fakeStore(options: { createError?: unknown; documents?: StoredContent[]; deletedCount?: number } = {}) {
  const calls: { method: string; argument: unknown }[] = [];
  const store: BirthdayContentStore = {
    create: async (document) => {
      calls.push({ method: "create", argument: document });
      if (options.createError) {
        throw options.createError;
      }
    },
    findByGuild: async (guildId) => {
      calls.push({ method: "findByGuild", argument: guildId });
      return options.documents ?? [];
    },
    deleteOne: async (filter) => {
      calls.push({ method: "deleteOne", argument: filter });
      return { deletedCount: options.deletedCount ?? 1 };
    },
  };
  return { store, calls };
}

const MESSAGE = { guildId: "guild", addedBy: "admin", type: "message", text: "С днём рождения!" } as const;

test("add stores the item", async () => {
  const { store, calls } = fakeStore();

  assert.equal(await createBirthdayContentRepository(store).add(MESSAGE), "added");
  assert.deepEqual(calls, [{ method: "create", argument: MESSAGE }]);
});

test("add reports a video already in the collection, and passes on other errors", async () => {
  const duplicate = fakeStore({ createError: Object.assign(new Error("E11000 duplicate key"), { code: 11000 }) });
  const broken = fakeStore({ createError: new Error("connection closed") });

  assert.equal(await createBirthdayContentRepository(duplicate.store).add(MESSAGE), "duplicate");
  await assert.rejects(createBirthdayContentRepository(broken.store).add(MESSAGE), /connection closed/);
});

test("list returns the server's items in the store's order, skipping incomplete documents", async () => {
  const { store, calls } = fakeStore({
    documents: [
      stored("1", { text: "Feliz aniversário!" }),
      stored("2", { type: "video", videoId: "dQw4w9WgXcQ", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
      stored("3", { type: "video", videoId: null }),
    ],
  });

  const items = await createBirthdayContentRepository(store).list("guild");

  assert.deepEqual(calls, [{ method: "findByGuild", argument: "guild" }]);
  assert.deepEqual(
    items.map((item) => [item.id, item.type]),
    [
      ["1", "message"],
      ["2", "video"],
    ],
  );
});

test("remove deletes only the server's item and reports whether it existed", async () => {
  const found = fakeStore({ deletedCount: 1 });
  const missing = fakeStore({ deletedCount: 0 });

  assert.equal(await createBirthdayContentRepository(found.store).remove("guild", "abc"), true);
  assert.equal(await createBirthdayContentRepository(missing.store).remove("guild", "abc"), false);
  assert.deepEqual(found.calls, [{ method: "deleteOne", argument: { _id: "abc", guildId: "guild" } }]);
});

test("toBirthdayContent maps messages and videos and skips other documents", () => {
  assert.deepEqual(toBirthdayContent(stored("1", { text: "Oi" })), {
    id: "1",
    guildId: "guild",
    addedBy: "admin",
    createdAt: CREATED,
    type: "message",
    text: "Oi",
  });
  assert.equal(toBirthdayContent(stored("2", { type: "gif" })), undefined);
  assert.equal(toBirthdayContent(stored("3", { text: "" })), undefined);
});

test("the Mongoose store fails at once while the database is not connected", async () => {
  await assert.rejects(mongooseContentStore.create({ guildId: "guild" }));
  await assert.rejects(mongooseContentStore.findByGuild("guild"));
  await assert.rejects(mongooseContentStore.deleteOne({ guildId: "guild" }));
});

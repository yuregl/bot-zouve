import assert from "node:assert/strict";
import { test } from "node:test";
import { BirthdayContentModel } from "../../../../src/infra/db/models/birthday-content-model.js";

test("the model lists items by server and date, and keeps each video once per server", () => {
  assert.deepEqual(BirthdayContentModel.schema.indexes(), [
    [{ guildId: 1, createdAt: 1 }, {}],
    [{ guildId: 1, videoId: 1 }, { unique: true, partialFilterExpression: { videoId: { $type: "string" } } }],
  ]);
  assert.equal(BirthdayContentModel.collection.collectionName, "birthdaycontents");
});

test("the model accepts messages and videos and refuses other types and long messages", () => {
  const base = { guildId: "guild", addedBy: "admin" };

  assert.equal(new BirthdayContentModel({ ...base, type: "message", text: "Feliz aniversário!" }).validateSync(), undefined);
  assert.equal(
    new BirthdayContentModel({ ...base, type: "video", videoId: "dQw4w9WgXcQ", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }).validateSync(),
    undefined,
  );

  const errors = new BirthdayContentModel({ guildId: "guild", type: "gif", text: "a".repeat(501) }).validateSync()?.errors ?? {};
  assert.deepEqual(new Set(Object.keys(errors)), new Set(["type", "text", "addedBy"]));
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { BirthdayModel } from "../../../../src/infra/db/models/birthday-model.js";

const REQUIRED = { guildId: "guild", userId: "ana", username: "ana.silva", setBy: "admin" };

test("the model keeps one birthday per member and server, with Discord IDs as strings", () => {
  assert.deepEqual(BirthdayModel.schema.indexes(), [[{ guildId: 1, userId: 1 }, { unique: true }]]);
  assert.equal(BirthdayModel.schema.path("userId").instance, "String");
  assert.equal(BirthdayModel.schema.path("birthDate").instance, "Date");
  assert.equal(BirthdayModel.collection.collectionName, "birthdays");
});

test("the model accepts a full date or a day and month", () => {
  assert.equal(new BirthdayModel({ ...REQUIRED, birthDate: new Date("1994-08-24T00:00:00Z") }).validateSync(), undefined);
  assert.equal(new BirthdayModel({ ...REQUIRED, day: 24, month: 8 }).validateSync(), undefined);
});

test("the model requires the username and refuses impossible days and months", () => {
  const errors = new BirthdayModel({ guildId: "guild", userId: "ana", setBy: "admin", day: 32, month: 13 }).validateSync()?.errors ?? {};

  assert.deepEqual(new Set(Object.keys(errors)), new Set(["username", "day", "month"]));
});

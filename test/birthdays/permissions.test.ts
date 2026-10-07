import assert from "node:assert/strict";
import { test } from "node:test";
import { canManageBirthdays, parseRoleList } from "../../src/birthdays/permissions.js";

test("parseRoleList reads comma-separated names and IDs, ignoring case, spaces, and empty entries", () => {
  assert.deepEqual(parseRoleList(" Admin, moderador ,,123456789012345678 "), ["admin", "moderador", "123456789012345678"]);
  assert.deepEqual(parseRoleList(""), []);
  assert.deepEqual(parseRoleList(undefined), []);
});

const ROLES = [
  { id: "1", name: "@everyone" },
  { id: "2", name: "Admin " },
];

test("canManageBirthdays accepts a role listed by name, without regard to case", () => {
  assert.equal(canManageBirthdays(ROLES, ["admin"]), true);
});

test("canManageBirthdays accepts a role listed by ID", () => {
  assert.equal(canManageBirthdays(ROLES, ["2"]), true);
});

test("canManageBirthdays refuses members without a listed role", () => {
  assert.equal(canManageBirthdays(ROLES, ["moderador"]), false);
  assert.equal(canManageBirthdays([], ["admin"]), false);
  assert.equal(canManageBirthdays(ROLES, []), false);
});

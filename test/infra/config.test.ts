import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_TIMEOUTS, describeDuration, readAnnounceTime, readTimeouts } from "../../src/infra/config.js";

test("readTimeouts keeps the defaults when the variables are unset or empty", () => {
  assert.deepEqual(readTimeouts({}), DEFAULT_TIMEOUTS);
  assert.deepEqual(readTimeouts({ IDLE_TIMEOUT_SECONDS: " " }), DEFAULT_TIMEOUTS);
  assert.deepEqual(DEFAULT_TIMEOUTS, { idleMs: 300_000, aloneMs: 180_000, skipVoteMs: 60_000 });
});

test("readTimeouts reads each timeout in seconds", () => {
  assert.deepEqual(
    readTimeouts({ IDLE_TIMEOUT_SECONDS: "600", ALONE_TIMEOUT_SECONDS: "120", SKIP_VOTE_TIMEOUT_SECONDS: "30" }),
    { idleMs: 600_000, aloneMs: 120_000, skipVoteMs: 30_000 },
  );
});

test("readTimeouts refuses values that are not whole seconds above zero", () => {
  for (const value of ["0", "-5", "1.5", "five"]) {
    assert.throws(() => readTimeouts({ ALONE_TIMEOUT_SECONDS: value }), /ALONE_TIMEOUT_SECONDS must be a whole number/);
  }
});

test("describeDuration writes minutes and seconds for users", () => {
  assert.equal(describeDuration(300_000), "5 minutes");
  assert.equal(describeDuration(60_000), "1 minute");
  assert.equal(describeDuration(90_000), "1 minute 30 seconds");
  assert.equal(describeDuration(1000), "1 second");
  assert.equal(describeDuration(45_000), "45 seconds");
});

test("readAnnounceTime keeps 09:00 when the variable is unset or empty", () => {
  assert.deepEqual(readAnnounceTime({}), { hour: 9, minute: 0 });
  assert.deepEqual(readAnnounceTime({ BIRTHDAY_ANNOUNCE_TIME: " " }), { hour: 9, minute: 0 });
});

test("readAnnounceTime reads HH:MM", () => {
  assert.deepEqual(readAnnounceTime({ BIRTHDAY_ANNOUNCE_TIME: "00:00" }), { hour: 0, minute: 0 });
  assert.deepEqual(readAnnounceTime({ BIRTHDAY_ANNOUNCE_TIME: "23:59" }), { hour: 23, minute: 59 });
});

test("readAnnounceTime refuses other formats and impossible times", () => {
  for (const value of ["9:00", "24:00", "09:60", "09h", "nine"]) {
    assert.throws(() => readAnnounceTime({ BIRTHDAY_ANNOUNCE_TIME: value }), /BIRTHDAY_ANNOUNCE_TIME must be a time written as HH:MM/, value);
  }
});

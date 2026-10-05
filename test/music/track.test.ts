import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration, parseTimestamp } from "../../src/music/track.js";

test("parseTimestamp reads minutes and seconds, with optional hours", () => {
  assert.equal(parseTimestamp("2:13"), 133);
  assert.equal(parseTimestamp(" 0:05 "), 5);
  assert.equal(parseTimestamp("75:00"), 4500);
  assert.equal(parseTimestamp("1:02:30"), 3750);
});

test("parseTimestamp refuses plain seconds and malformed times", () => {
  for (const text of ["133", "2:5", "2:60", "1:60:00", "-1:00", "2:13:", "abc", ""]) {
    assert.equal(parseTimestamp(text), undefined, text);
  }
});

test("formatDuration formats minutes and seconds", () => {
  assert.equal(formatDuration(5), "0:05");
  assert.equal(formatDuration(213), "3:33");
});

test("formatDuration includes hours for long tracks", () => {
  assert.equal(formatDuration(3_725), "1:02:05");
});

test("formatDuration handles unknown durations", () => {
  assert.equal(formatDuration(0), "--:--");
  assert.equal(formatDuration(Number.NaN), "--:--");
});

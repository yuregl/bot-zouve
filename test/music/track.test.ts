import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDuration } from "../../src/music/track.js";

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

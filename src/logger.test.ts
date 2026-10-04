import assert from "node:assert/strict";
import { test } from "node:test";
import { formatError, formatLogLine } from "./logger.js";

const date = new Date("2026-10-04T17:00:00.000Z");

test("formatLogLine includes timestamp, level, scope, and context", () => {
  assert.equal(
    formatLogLine(date, "info", "play", "Track queued", { track: "Song" }),
    '2026-10-04T17:00:00.000Z INFO  [play] Track queued {"track":"Song"}',
  );
});

test("formatLogLine omits empty context", () => {
  assert.equal(formatLogLine(date, "warn", "bot", "Hello", {}), "2026-10-04T17:00:00.000Z WARN  [bot] Hello");
});

test("formatError includes the cause chain and child process stderr", () => {
  const cause = Object.assign(new Error("yt-dlp exited with code 1"), { stderr: "ERROR: Video unavailable" });
  const output = formatError(new Error("Could not load", { cause }));

  assert.match(output, /Error: Could not load/);
  assert.match(output, /caused by:/);
  assert.match(output, /yt-dlp exited with code 1/);
  assert.match(output, /stderr:\n\s+ERROR: Video unavailable/);
});

test("formatError handles non-Error values", () => {
  assert.equal(formatError("boom"), "  'boom'");
});

import assert from "node:assert/strict";
import { test } from "node:test";
import { describeContent, MAX_MESSAGE_LENGTH, parseBirthdayMessage } from "../../src/birthdays/birthday-content.js";

test("parseBirthdayMessage trims the message", () => {
  assert.deepEqual(parseBirthdayMessage("  जन्मदिन मुबारक हो! 🎂  "), { text: "जन्मदिन मुबारक हो! 🎂" });
});

test("parseBirthdayMessage refuses empty and too long messages", () => {
  assert.deepEqual(parseBirthdayMessage("   "), { error: "Write a message to add." });
  assert.deepEqual(parseBirthdayMessage("a".repeat(MAX_MESSAGE_LENGTH)), { text: "a".repeat(MAX_MESSAGE_LENGTH) });
  assert.deepEqual(parseBirthdayMessage("a".repeat(MAX_MESSAGE_LENGTH + 1)), {
    error: "Messages can have up to 500 characters; this one has 501.",
  });
});

test("describeContent shows videos by link and shortens long messages to one line", () => {
  const base = { guildId: "guild", addedBy: "admin" };

  assert.equal(
    describeContent({ ...base, type: "video", videoId: "dQw4w9WgXcQ", videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
    "🎬 https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  );
  assert.equal(describeContent({ ...base, type: "message", text: "Feliz\naniversário!" }), "💬 Feliz aniversário!");
  assert.equal(describeContent({ ...base, type: "message", text: "abcdefghij" }, 5), "💬 abcd…");
});

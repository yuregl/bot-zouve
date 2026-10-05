import assert from "node:assert/strict";
import { test } from "node:test";
import { getYouTubeVideoId, isYouTubeUrl } from "../../src/music/youtube.js";

test("getYouTubeVideoId extracts the id from YouTube video links", () => {
  assert.equal(getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(getYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(getYouTubeVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(getYouTubeVideoId("  https://music.youtube.com/watch?v=dQw4w9WgXcQ  "), "dQw4w9WgXcQ");
});

test("getYouTubeVideoId ignores playlist and radio parameters", () => {
  assert.equal(
    getYouTubeVideoId("https://www.youtube.com/watch?v=RY3B_XXmTYU&list=RDRY3B_XXmTYU&start_radio=1"),
    "RY3B_XXmTYU",
  );
});

test("isYouTubeUrl rejects search terms, other sites, and playlist-only links", () => {
  assert.equal(isYouTubeUrl("never gonna give you up"), false);
  assert.equal(isYouTubeUrl("https://example.com/watch?v=dQw4w9WgXcQ"), false);
  assert.equal(isYouTubeUrl("https://www.youtube.com/playlist?list=RDRY3B_XXmTYU"), false);
  assert.equal(isYouTubeUrl("https://www.youtube.com/watch?v=short"), false);
});

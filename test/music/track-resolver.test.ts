import assert from "node:assert/strict";
import { test } from "node:test";
import { type LinkResolver, parseLink, type TrackResolver, TrackResolverRegistry } from "../../src/music/track-resolver.js";

function linkResolver(host: string, linkDescription: string): LinkResolver {
  return {
    linkDescription,
    failureMessage: `${host} failed`,
    canResolve: (url) => url.hostname === host,
    resolve: async () => [],
  };
}

const videoLinks = linkResolver("video.example", "a video");
const songLinks = linkResolver("song.example", "a song");
const search: TrackResolver = { failureMessage: "search failed", resolve: async () => [] };
const registry = new TrackResolverRegistry({ links: [videoLinks, songLinks], fallback: search });

test("TrackResolverRegistry sends a link to the resolver for its site", () => {
  assert.deepEqual(registry.find("  https://song.example/1  "), { resolver: songLinks, query: "https://song.example/1" });
  assert.deepEqual(registry.find("https://video.example/1"), { resolver: videoLinks, query: "https://video.example/1" });
});

test("TrackResolverRegistry sends any other text to the default resolver", () => {
  assert.deepEqual(registry.find("numb"), { resolver: search, query: "numb" });
  // Without a scheme it is not a link, so it goes to the default resolver.
  assert.deepEqual(registry.find("song.example/1"), { resolver: search, query: "song.example/1" });
});

test("TrackResolverRegistry lists the supported links when no site matches", () => {
  assert.deepEqual(registry.find("https://other.example/1"), {
    reason: "Only links to a video or a song are supported.",
  });
});

test("TrackResolverRegistry refuses empty queries", () => {
  assert.ok("reason" in registry.find("   "));
});

test("parseLink parses http and https links only", () => {
  assert.equal(parseLink(" https://youtu.be/x ")?.hostname, "youtu.be");
  assert.equal(parseLink("HTTP://example.com")?.hostname, "example.com");
  assert.equal(parseLink("youtube.com/watch?v=x"), undefined);
  assert.equal(parseLink("numb"), undefined);
});

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSpotifyLinkResolver,
  fetchSpotifyTrack,
  getSpotifyTrackId,
  parseTrackPage,
  readMetaTags,
  type SpotifyTrack,
} from "../../src/infra/spotify.js";
import type { Track } from "../../src/music/track.js";
import { UnsupportedTrackError } from "../../src/music/track-resolver.js";

const TRACK_ID = "2nLtzopw4rPReszdYBJU6h";

// Trimmed from the public page of a Spotify track.
const NUMB_PAGE = `<html><head>
<meta property="og:title" content="Numb"/>
<meta property="og:description" content="Linkin Park · Meteora · Song · 2003"/>
<meta name="music:duration" content="188"/>
<meta name="music:musician" content="https://open.spotify.com/artist/6XyY86QOPPrYVGvF9ch6wz"/>
<meta name="music:musician_description" content="Linkin Park"/>
</head></html>`;

test("getSpotifyTrackId reads track links, with or without a locale and tracking parameters", () => {
  assert.equal(getSpotifyTrackId(new URL(`https://open.spotify.com/track/${TRACK_ID}`)), TRACK_ID);
  assert.equal(getSpotifyTrackId(new URL(`https://open.spotify.com/intl-pt/track/${TRACK_ID}?si=abc`)), TRACK_ID);
});

test("getSpotifyTrackId ignores albums, playlists, and other sites", () => {
  assert.equal(getSpotifyTrackId(new URL(`https://open.spotify.com/album/${TRACK_ID}`)), undefined);
  assert.equal(getSpotifyTrackId(new URL(`https://open.spotify.com/playlist/${TRACK_ID}`)), undefined);
  assert.equal(getSpotifyTrackId(new URL(`https://example.com/track/${TRACK_ID}`)), undefined);
  assert.equal(getSpotifyTrackId(new URL("https://open.spotify.com/track/short")), undefined);
});

test("readMetaTags reads tags in any attribute order and decodes entities", () => {
  const tags = readMetaTags(`<meta content="Guns N&#x27; Roses &amp; Friends" name="music:musician_description">`);

  assert.equal(tags.get("music:musician_description"), "Guns N' Roses & Friends");
});

test("parseTrackPage reads the title, artists, and duration", () => {
  assert.deepEqual(parseTrackPage(NUMB_PAGE), { name: "Numb", artists: "Linkin Park", durationSeconds: 188 });
});

test("parseTrackPage keeps the title when the artists or duration are missing", () => {
  assert.deepEqual(parseTrackPage(`<meta property="og:title" content="Numb">`), {
    name: "Numb",
    artists: undefined,
    durationSeconds: undefined,
  });
  assert.equal(parseTrackPage("<html></html>"), undefined);
});

/** A fake open.spotify.com that answers the track page and oEmbed requests. */
function fakeSpotify(page: { status: number; html?: string }, oembed: { status: number; title?: string } = { status: 500 }) {
  const urls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    return url.includes("/oembed")
      ? Response.json({ title: oembed.title }, { status: oembed.status })
      : new Response(page.html ?? "", { status: page.status });
  }) as typeof fetch;
  return { fetchImpl, urls };
}

test("fetchSpotifyTrack reads the public track page", async () => {
  const { fetchImpl, urls } = fakeSpotify({ status: 200, html: NUMB_PAGE });

  assert.deepEqual(await fetchSpotifyTrack(TRACK_ID, fetchImpl), { name: "Numb", artists: "Linkin Park", durationSeconds: 188 });
  assert.deepEqual(urls, [`https://open.spotify.com/track/${TRACK_ID}`]);
});

test("fetchSpotifyTrack falls back to the oEmbed title when the page has no details", async () => {
  for (const page of [{ status: 200, html: "<html></html>" }, { status: 503 }]) {
    const { fetchImpl } = fakeSpotify(page, { status: 200, title: "Numb" });

    assert.deepEqual(await fetchSpotifyTrack(TRACK_ID, fetchImpl), { name: "Numb" });
  }
});

test("fetchSpotifyTrack refuses tracks that do not exist and reports other failures", async () => {
  await assert.rejects(fetchSpotifyTrack(TRACK_ID, fakeSpotify({ status: 404 }).fetchImpl), UnsupportedTrackError);
  await assert.rejects(fetchSpotifyTrack(TRACK_ID, fakeSpotify({ status: 503 }, { status: 404 }).fetchImpl), UnsupportedTrackError);
  await assert.rejects(fetchSpotifyTrack(TRACK_ID, fakeSpotify({ status: 503 }, { status: 500 }).fetchImpl), /HTTP 500/);
});

function recordingFinder() {
  const searches: { terms: string; durationSeconds?: number }[] = [];
  const find = async (terms: string, durationSeconds: number | undefined, requestedBy: string): Promise<Track> => {
    searches.push({ terms, durationSeconds });
    return { title: `${terms} (YouTube)`, url: "https://www.youtube.com/watch?v=x", durationSeconds: 186, requestedBy };
  };
  return { searches, find };
}

test("the Spotify resolver finds the song on YouTube by artists, title, and duration", async () => {
  const { searches, find } = recordingFinder();
  const spotifyTrack: SpotifyTrack = { name: "Numb", artists: "Linkin Park", durationSeconds: 188 };
  const resolver = createSpotifyLinkResolver(find, async () => spotifyTrack);

  const link = `https://open.spotify.com/track/${TRACK_ID}`;
  assert.equal(resolver.canResolve(new URL(link)), true);

  const [track] = await resolver.resolve(link, "user");

  assert.deepEqual(searches, [{ terms: "Linkin Park - Numb", durationSeconds: 188 }]);
  // Shown as Spotify names it, played from YouTube.
  assert.equal(track?.title, "Linkin Park - Numb");
  assert.equal(track?.url, "https://www.youtube.com/watch?v=x");
});

test("the Spotify resolver searches by title alone when only the title is known", async () => {
  const { searches, find } = recordingFinder();
  const resolver = createSpotifyLinkResolver(find, async () => ({ name: "Numb" }));

  const [track] = await resolver.resolve(`https://open.spotify.com/track/${TRACK_ID}`, "user");

  assert.deepEqual(searches, [{ terms: "Numb", durationSeconds: undefined }]);
  assert.equal(track?.title, "Numb");
});

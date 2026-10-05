import type { Track } from "../music/track.js";
import { type LinkResolver, UnsupportedTrackError } from "../music/track-resolver.js";
import { createLogger } from "./logger.js";

const logger = createLogger("spotify");

const SPOTIFY_HOSTS = new Set(["open.spotify.com", "play.spotify.com"]);
// Track links may have a locale segment, like /intl-pt/track/<id>.
const TRACK_PATH = /^\/(?:intl-[a-z-]+\/)?track\/([A-Za-z0-9]{22})\/?$/i;

export interface SpotifyTrack {
  name: string;
  /** Artists as Spotify lists them, like "Luis Fonsi, Daddy Yankee"; undefined when unknown. */
  artists?: string;
  durationSeconds?: number;
}

/** Reads the track id from a Spotify track link; albums, playlists, and other links return undefined. */
export function getSpotifyTrackId(url: URL): string | undefined {
  return SPOTIFY_HOSTS.has(url.hostname) ? url.pathname.match(TRACK_PATH)?.[1] : undefined;
}

const HTML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeHtml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(Number(code.slice(1)));
    }
    return HTML_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** Collects the `<meta>` tags of an HTML page by their `property` or `name`, keeping the first of each. */
export function readMetaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();

  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = tag.match(/\b(?:property|name)="([^"]*)"/i)?.[1];
    const content = tag.match(/\bcontent="([^"]*)"/i)?.[1];
    if (key && content !== undefined && !tags.has(key)) {
      tags.set(key, decodeHtml(content));
    }
  }

  return tags;
}

/** Reads a track from the link-preview tags of its public Spotify page. */
export function parseTrackPage(html: string): SpotifyTrack | undefined {
  const tags = readMetaTags(html);
  const name = tags.get("og:title")?.trim();

  if (!name) {
    return undefined;
  }

  const duration = Number(tags.get("music:duration"));
  return {
    name,
    artists: tags.get("music:musician_description")?.trim() || undefined,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : undefined,
  };
}

/**
 * Reads a track's title, artists, and duration without Spotify credentials: from the
 * link-preview tags of its public page, as chat apps do, or, if the page changes, the
 * title alone from Spotify's public oEmbed endpoint.
 */
export async function fetchSpotifyTrack(id: string, fetchImpl: typeof fetch = fetch): Promise<SpotifyTrack> {
  const link = `https://open.spotify.com/track/${id}`;
  const page = await fetchImpl(link);

  if (page.status === 404) {
    throw new UnsupportedTrackError("This Spotify track was not found. Check the link.");
  }

  if (page.ok) {
    const track = parseTrackPage(await page.text());
    if (track) {
      return track;
    }
    logger.warn("Spotify page has no track details; using oEmbed", { id });
  } else {
    logger.warn("Spotify page request failed; using oEmbed", { id, status: page.status });
  }

  const oembed = await fetchImpl(`https://open.spotify.com/oembed?url=${encodeURIComponent(link)}`);

  if (oembed.status === 404) {
    throw new UnsupportedTrackError("This Spotify track was not found. Check the link.");
  }

  if (!oembed.ok) {
    throw new Error(`Spotify returned HTTP ${oembed.status} for track ${id}.`);
  }

  const { title } = (await oembed.json()) as { title?: unknown };

  if (typeof title !== "string" || !title.trim()) {
    throw new Error(`Spotify returned no title for track ${id}.`);
  }

  return { name: title.trim() };
}

type FindOnYouTube = (terms: string, durationSeconds: number | undefined, requestedBy: string) => Promise<Track>;

/** Plays a Spotify track link by finding the same song on YouTube. */
export function createSpotifyLinkResolver(
  findOnYouTube: FindOnYouTube,
  getTrack: (id: string) => Promise<SpotifyTrack> = fetchSpotifyTrack,
): LinkResolver {
  return {
    linkDescription: "a Spotify track",
    failureMessage: "Could not load this Spotify track right now. Try again.",
    canResolve: (url) => getSpotifyTrackId(url) !== undefined,
    async resolve(query, requestedBy) {
      const id = getSpotifyTrackId(new URL(query));

      if (!id) {
        throw new UnsupportedTrackError("Send a link to a single Spotify track.");
      }

      const spotifyTrack = await getTrack(id);
      const label = spotifyTrack.artists ? `${spotifyTrack.artists} - ${spotifyTrack.name}` : spotifyTrack.name;
      logger.debug("Spotify track found", { id, label, durationSeconds: spotifyTrack.durationSeconds });

      const track = await findOnYouTube(label, spotifyTrack.durationSeconds, requestedBy);
      // Show the song as Spotify names it; the audio and link come from YouTube.
      return [{ ...track, title: label }];
    },
  };
}

import type { Track } from "./track.js";

/** A request that cannot be played, with a message that explains why to the user. */
export class UnsupportedTrackError extends Error {}

/** Turns what a user sent to /play into playable tracks. */
export interface TrackResolver {
  /** Shown when resolving fails for a reason other than an UnsupportedTrackError. */
  readonly failureMessage: string;
  /** Resolves the query; throws UnsupportedTrackError with a user-facing message to refuse it. */
  resolve(query: string, requestedBy: string): Promise<Track[]>;
}

/** A resolver for links to one music source, chosen by the link's address. */
export interface LinkResolver extends TrackResolver {
  /** Describes the links this resolver accepts, like "a single YouTube video". */
  readonly linkDescription: string;
  canResolve(url: URL): boolean;
}

export type ResolverMatch = { resolver: TrackResolver; query: string } | { reason: string };

/**
 * Chooses how to resolve a /play request: links go to the resolver for their site, and any
 * other text goes to the default resolver.
 */
export class TrackResolverRegistry {
  private readonly links: readonly LinkResolver[];
  private readonly fallback: TrackResolver;

  constructor(options: { links: readonly LinkResolver[]; fallback: TrackResolver }) {
    this.links = options.links;
    this.fallback = options.fallback;
  }

  find(rawQuery: string): ResolverMatch {
    const query = rawQuery.trim();

    if (!query) {
      return { reason: "Send a YouTube link or the name of a song." };
    }

    const url = parseLink(query);
    if (!url) {
      return { resolver: this.fallback, query };
    }

    const resolver = this.links.find((candidate) => candidate.canResolve(url));
    if (resolver) {
      return { resolver, query };
    }

    const supported = this.links.map((candidate) => candidate.linkDescription).join(" or ");
    return { reason: `Only links to ${supported} are supported.` };
  }
}

/** Parses an http or https link; returns undefined for anything else, such as search terms. */
export function parseLink(query: string): URL | undefined {
  const text = query.trim();

  if (!/^https?:\/\//i.test(text)) {
    return undefined;
  }

  try {
    return new URL(text);
  } catch {
    return undefined;
  }
}

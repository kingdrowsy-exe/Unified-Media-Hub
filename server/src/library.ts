import { config } from "./config.js";
import { cached } from "./cache.js";
import { createLimiter } from "./concurrencyLimiter.js";
import { listPopularLibraryItems, PlexItem, searchLibraryItems as searchPlexItems } from "./clients/plex.js";
import { listSiloItems, searchSiloItems, SiloItem } from "./clients/silo.js";
import { listPopularEmbyItems, searchEmbyItems, EmbyItem } from "./clients/emby.js";
import { mergeLibraries, matchKey, MergedItem, Source } from "./merge.js";
import { NotConfiguredError } from "./settingsStore.js";

async function safeList<T>(fn: () => Promise<T[]>): Promise<{ items: T[]; configured: boolean }> {
  try {
    return { items: await fn(), configured: true };
  } catch (err) {
    if (err instanceof NotConfiguredError) {
      return { items: [], configured: false };
    }
    throw err;
  }
}

export interface OwnedLibrary {
  merged: MergedItem[];
  sources: { plex: boolean; silo: boolean; emby: boolean };
}

// Shared by /api/ondemand and /api/popular so both read the same cached, bounded
// "popular" page instead of each independently querying Plex/Silo/Emby.
export function getOwnedPopularLibrary(): Promise<OwnedLibrary> {
  return cached("ondemand:popular", config.cacheTtlSeconds, async () => {
    const [plex, silo, emby] = await Promise.all([
      safeList<PlexItem>(listPopularLibraryItems),
      safeList<SiloItem>(listSiloItems),
      safeList<EmbyItem>(listPopularEmbyItems),
    ]);
    return {
      merged: mergeLibraries(plex.items, silo.items, emby.items),
      sources: { plex: plex.configured, silo: silo.configured, emby: emby.configured },
    };
  });
}

// A real, live, title-filtered search against Plex, Silo, and Emby - all use targeted,
// indexed queries (not a full library scan), so this is safe to run per user-initiated
// search rather than only searching the small cached "popular" page, which would miss
// almost everything you actually own.
export async function searchOwnedLibrary(query: string): Promise<OwnedLibrary> {
  const [plex, silo, emby] = await Promise.all([
    safeList<PlexItem>(() => searchPlexItems(query)),
    safeList<SiloItem>(() => searchSiloItems(query)),
    safeList<EmbyItem>(() => searchEmbyItems(query)),
  ]);
  return {
    merged: mergeLibraries(plex.items, silo.items, emby.items),
    sources: { plex: plex.configured, silo: silo.configured, emby: emby.configured },
  };
}

interface OwnableItem {
  title: string;
  year?: number;
  sources: { source: Source; id: string }[];
}

// Shared by /api/popular, /api/popular/expand, and /api/trakt/* (watchlist,
// recommendations): each title's ownership check is a live, targeted Plex/Silo/Emby
// search (the same one GET /api/match uses), never a full-library scan. Callers wrap this
// in their own cache so a given batch of titles only actually runs once per cache window.
//
// This limiter is module-level (one instance, not one per call) deliberately: Popular
// Movies, Popular Shows, the "See All" expansions, and both Trakt shelves can all refresh
// their cache around the same time (e.g. right when someone loads On Demand after the
// cache has expired), and each is its own batch of many titles. A per-call concurrency
// cap wouldn't stop those batches from stacking on top of each other - only a single
// shared limiter actually bounds how many ownership searches are in flight at once,
// server-wide, against Plex/Silo/Emby.
const MATCH_CONCURRENCY = 4;
const matchLimiter = createLimiter(MATCH_CONCURRENCY);

export async function attachOwnership<T extends OwnableItem>(items: T[]): Promise<void> {
  await Promise.all(
    items.map((item) =>
      matchLimiter(async () => {
        try {
          const { merged } = await searchOwnedLibrary(item.title);
          const targetKey = matchKey(item.title, item.year);
          const match = merged.find((m) => matchKey(m.title, m.year) === targetKey);
          if (match) item.sources = match.sources;
        } catch {
          // Leave unmatched on any lookup failure - the tile just shows as not-in-library.
        }
      }),
    ),
  );
}

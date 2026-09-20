import { config } from "./config.js";
import { cached } from "./cache.js";
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

// Shared by /api/popular and /api/trakt/* (watchlist, recommendations): each title's
// ownership check is a live, targeted Plex/Silo/Emby search (the same one GET /api/match
// uses), never a full-library scan. Callers wrap this in their own cache so a given batch
// of titles only actually runs once per cache window. A small concurrency cap just keeps
// that one-time batch from bursting every lookup at once.
const MATCH_CONCURRENCY = 4;

export async function attachOwnership<T extends OwnableItem>(items: T[]): Promise<void> {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const item = items[next++];
      try {
        const { merged } = await searchOwnedLibrary(item.title);
        const targetKey = matchKey(item.title, item.year);
        const match = merged.find((m) => matchKey(m.title, m.year) === targetKey);
        if (match) item.sources = match.sources;
      } catch {
        // Leave unmatched on any lookup failure - the tile just shows as not-in-library.
      }
    }
  }
  await Promise.all(Array.from({ length: MATCH_CONCURRENCY }, worker));
}

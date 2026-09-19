import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { cached } from "../cache.js";
import { getBasicItem } from "../clients/tmdb.js";
import { getRecommendations, getWatchlist, TraktListItem } from "../clients/trakt.js";
import { attachOwnership } from "../library.js";
import { NotConfiguredError } from "../settingsStore.js";
import { PopularItem } from "./popular.js";

// Trakt hands back bare ids, not artwork/genre/rating - one light TMDB lookup per item
// fills a tile in, same as any other TMDB-sourced shelf. Concurrency-capped so a full
// watchlist/recommendations batch doesn't burst TMDB all at once.
const TMDB_LOOKUP_CONCURRENCY = 4;

async function toPopularItems(items: TraktListItem[]): Promise<PopularItem[]> {
  const results: (PopularItem | null)[] = new Array(items.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      const item = items[i];
      const tmdb = await getBasicItem(item.tmdbId, item.type);
      if (!tmdb) continue;
      results[i] = {
        id: `tmdb:${item.type}:${item.tmdbId}`,
        title: tmdb.title || item.title,
        year: tmdb.year ?? item.year,
        type: item.type,
        poster: tmdb.poster,
        backdrop: tmdb.backdrop,
        genre: tmdb.genre,
        ratingPercent: tmdb.ratingPercent,
        sources: [],
      };
    }
  }
  await Promise.all(Array.from({ length: TMDB_LOOKUP_CONCURRENCY }, worker));
  return results.filter((i): i is PopularItem => i !== null);
}

export async function traktRoutes(app: FastifyInstance) {
  app.get("/api/trakt/watchlist", async () => {
    try {
      return await cached("trakt:watchlist", config.cacheTtlSeconds, async () => {
        const items = await toPopularItems(await getWatchlist());
        await attachOwnership(items);
        return { items, configured: true };
      });
    } catch (err) {
      if (err instanceof NotConfiguredError) {
        return { items: [], configured: false };
      }
      throw err;
    }
  });

  app.get("/api/trakt/recommendations", async () => {
    try {
      return await cached("trakt:recommendations", config.cacheTtlSeconds, async () => {
        const items = await toPopularItems(await getRecommendations());
        await attachOwnership(items);
        return { items, configured: true };
      });
    } catch (err) {
      if (err instanceof NotConfiguredError) {
        return { items: [], configured: false };
      }
      throw err;
    }
  });
}

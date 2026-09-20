import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { cached } from "../cache.js";
import { getPopularMovies, getPopularMoviesExpanded, getPopularShows, getPopularShowsExpanded, TmdbItem } from "../clients/tmdb.js";
import { attachOwnership, searchOwnedLibrary } from "../library.js";
import { matchKey, Source } from "../merge.js";
import { NotConfiguredError } from "../settingsStore.js";

export interface PopularItem {
  id: string;
  title: string;
  year?: number;
  type: "movie" | "show";
  poster?: string;
  backdrop?: string;
  genre?: string;
  ratingPercent?: number;
  sources: { source: Source; id: string }[];
}

function toPopularItem(t: TmdbItem): PopularItem {
  return {
    id: `tmdb:${t.type}:${t.id}`,
    title: t.title,
    year: t.year,
    type: t.type,
    poster: t.poster,
    backdrop: t.backdrop,
    genre: t.genre,
    ratingPercent: t.ratingPercent,
    sources: [],
  };
}

export async function popularRoutes(app: FastifyInstance) {
  app.get("/api/popular", async () => {
    try {
      return await cached("popular:full", config.cacheTtlSeconds, async () => {
        // Sequential, not Promise.all - keeps requests to TMDB spaced out one at a time
        // rather than bursting, even though this only ever runs once per cache window.
        const movies = (await getPopularMovies()).map(toPopularItem);
        const shows = (await getPopularShows()).map(toPopularItem);
        await Promise.all([attachOwnership(movies), attachOwnership(shows)]);
        return { movies, shows, configured: true };
      });
    } catch (err) {
      if (err instanceof NotConfiguredError) {
        return { movies: [], shows: [], configured: false };
      }
      throw err;
    }
  });

  // Powers the "See All" view - a much bigger list than the shelf itself shows, fetched
  // (and owner-matched) lazily only when someone actually opens it, cached separately so
  // it doesn't add cost to every routine popular:full refresh.
  app.get("/api/popular/expand", async (request) => {
    const { type } = request.query as { type?: string };
    if (type !== "movie" && type !== "show") {
      return { items: [], configured: true };
    }
    try {
      return await cached(`popular:expand:${type}`, config.cacheTtlSeconds, async () => {
        const items = (type === "movie" ? await getPopularMoviesExpanded() : await getPopularShowsExpanded()).map(
          toPopularItem,
        );
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

  app.get("/api/match", async (request) => {
    const { title, year } = request.query as { title?: string; year?: string };
    if (!title) {
      return { sources: [] };
    }
    const { merged } = await searchOwnedLibrary(title);
    const targetKey = matchKey(title, year ? Number(year) : undefined);
    const match = merged.find((item) => matchKey(item.title, item.year) === targetKey);
    return { sources: match?.sources ?? [] };
  });
}

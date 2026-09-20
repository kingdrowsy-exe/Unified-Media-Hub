import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PopularItem, fetchPopular, fetchPopularExpanded, fetchTraktRecommendations, fetchTraktWatchlist } from "../api.js";
import MovieDetail from "../components/MovieDetail.js";
import Hero, { HeroItem } from "../components/Hero.js";
import Shelf from "../components/Shelf.js";
import Tile from "../components/Tile.js";

const HERO_SLIDE_COUNT = 8;

// Alternate movie/show/movie/show... so the rotation isn't just "all movies then all shows".
function interleave<T>(a: T[], b: T[]): T[] {
  const result: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) result.push(a[i]);
    if (b[i]) result.push(b[i]);
  }
  return result;
}

export default function OnDemand() {
  const [popularMovies, setPopularMovies] = useState<PopularItem[]>([]);
  const [popularShows, setPopularShows] = useState<PopularItem[]>([]);
  const [tmdbConfigured, setTmdbConfigured] = useState<boolean | null>(null);
  const [watchlist, setWatchlist] = useState<PopularItem[]>([]);
  const [recommendations, setRecommendations] = useState<PopularItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<PopularItem | null>(null);
  const [expandedShelf, setExpandedShelf] = useState<{ title: string; items: PopularItem[]; loadingMore: boolean } | null>(
    null,
  );

  // Popular Movies/Shows only show ~25 items normally (cheap to keep loaded for the
  // shelf); "See All" wants far more, so fetch a bigger, separately-cached batch lazily,
  // showing what's already loaded immediately rather than blocking on it.
  function openExpandedPopular(type: "movie" | "show", title: string, fallback: PopularItem[]) {
    setExpandedShelf({ title, items: fallback, loadingMore: true });
    // Guard against a stale response landing after the user closed this shelf or opened
    // a different one while the fetch was still in flight.
    fetchPopularExpanded(type)
      .then((res) => {
        setExpandedShelf((prev) =>
          prev && prev.title === title
            ? { title, items: res.items.length > 0 ? res.items : fallback, loadingMore: false }
            : prev,
        );
      })
      .catch(() => {
        setExpandedShelf((prev) => (prev && prev.title === title ? { title, items: fallback, loadingMore: false } : prev));
      });
  }

  useEffect(() => {
    fetchPopular()
      .then((res) => {
        setPopularMovies(res.movies);
        setPopularShows(res.shows);
        setTmdbConfigured(res.configured);
      })
      .catch(() => setTmdbConfigured(false));
    fetchTraktWatchlist()
      .then((res) => setWatchlist(res.items))
      .catch(() => setWatchlist([]));
    fetchTraktRecommendations()
      .then((res) => setRecommendations(res.items))
      .catch(() => setRecommendations([]));
  }, []);

  function handleSelectSimilar(tmdbId: number, type: "movie" | "show") {
    setSelectedItem({ id: `tmdb:${type}:${tmdbId}`, title: "", type, sources: [] });
  }

  const heroItems: HeroItem[] = useMemo(
    () =>
      interleave(popularMovies, popularShows)
        .slice(0, HERO_SLIDE_COUNT)
        .map((item) => ({
          image: item.backdrop ?? item.poster,
          title: item.title,
          subtitle: [item.year, item.genre].filter(Boolean).join(" · "),
          owned: item.sources.length > 0,
          onPlay: () => setSelectedItem(item),
        })),
    [popularMovies, popularShows],
  );

  function renderTile(item: PopularItem) {
    const isOwned = item.sources.length > 0;
    return (
      <Tile
        key={item.id}
        image={item.poster}
        title={item.title}
        genre={item.genre}
        ratingPercent={item.ratingPercent}
        year={item.year}
        owned={isOwned}
        badges={isOwned ? item.sources.map((s) => s.source) : undefined}
        onClick={() => setSelectedItem(item)}
      />
    );
  }

  return (
    <div className="page">
      {heroItems.length > 0 && <Hero items={heroItems} />}

      {tmdbConfigured === false && (
        <div className="notice">
          TMDB isn't connected yet, so Popular Movies/Shows aren't available.{" "}
          <Link to="/settings">Connect TMDB</Link>
        </div>
      )}

      {watchlist.length > 0 && (
        <Shelf
          title="Your Trakt Watchlist"
          onTitleClick={() => setExpandedShelf({ title: "Your Trakt Watchlist", items: watchlist, loadingMore: false })}
        >
          {watchlist.map(renderTile)}
        </Shelf>
      )}
      {recommendations.length > 0 && (
        <Shelf
          title="Recommended for You"
          onTitleClick={() => setExpandedShelf({ title: "Recommended for You", items: recommendations, loadingMore: false })}
        >
          {recommendations.map(renderTile)}
        </Shelf>
      )}
      {popularMovies.length > 0 && (
        <Shelf title="Popular Movies" onTitleClick={() => openExpandedPopular("movie", "Popular Movies", popularMovies)}>
          {popularMovies.map(renderTile)}
        </Shelf>
      )}
      {popularShows.length > 0 && (
        <Shelf title="Popular Shows" onTitleClick={() => openExpandedPopular("show", "Popular Shows", popularShows)}>
          {popularShows.map(renderTile)}
        </Shelf>
      )}

      {expandedShelf && (
        <div className="shelf-overlay">
          <button className="detail-back" onClick={() => setExpandedShelf(null)} aria-label="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="shelf-overlay-scroll">
            <h1 className="shelf-overlay-title">{expandedShelf.title}</h1>
            <div className="search-grid">{expandedShelf.items.map(renderTile)}</div>
            {expandedShelf.loadingMore && <div className="status shelf-overlay-loading">Loading more…</div>}
          </div>
        </div>
      )}

      {selectedItem && (
        <MovieDetail
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onSelectSimilar={handleSelectSimilar}
        />
      )}
    </div>
  );
}

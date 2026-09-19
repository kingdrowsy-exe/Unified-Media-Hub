import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MergedItem, PopularItem, fetchOnDemand } from "../api.js";
import MovieDetail from "../components/MovieDetail.js";
import Tile from "../components/Tile.js";

type SourceFilter = "all" | "plex" | "silo";
type Playable = MergedItem | PopularItem;

export default function Search() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [items, setItems] = useState<MergedItem[]>([]);
  const [sources, setSources] = useState<{ plex: boolean; silo: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<Playable | null>(null);

  const hasQuery = query.trim().length > 0;

  useEffect(() => {
    if (!hasQuery) {
      setLoading(false);
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    const handle = setTimeout(() => {
      // Searches Plex and Silo only (both are live, targeted, indexed lookups - never a
      // full-library scan) - Live TV channels are a separate search on their own page.
      fetchOnDemand({ search: query, source: source === "all" ? undefined : source })
        .then((res) => {
          setItems(res.items);
          setSources(res.sources);
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, source, hasQuery]);

  function handleSelectSimilar(tmdbId: number, type: "movie" | "show") {
    setSelectedItem({ id: `tmdb:${type}:${tmdbId}`, title: "", type, sources: [] });
  }

  const noSourcesConnected = sources && !sources.plex && !sources.silo;

  return (
    <div className="page search-page">
      <div className="search-hero">
        <h1 className="search-heading">Search</h1>
        <div className="search-bar">
          <svg className="search-bar-icon" width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            autoFocus
            placeholder="Search movies and shows across Plex and Silo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery("")} aria-label="Clear search">
              &times;
            </button>
          )}
        </div>

        {hasQuery && (
          <div className="search-filters">
            {(["all", "plex", "silo"] as const).map((s) => (
              <span key={s} className={`chip ${source === s ? "active" : ""}`} onClick={() => setSource(s)}>
                {s === "all" ? "All" : s === "plex" ? "Plex" : "Silo"}
              </span>
            ))}
          </div>
        )}
      </div>

      {hasQuery && sources && !sources.plex && sources.silo && (
        <div className="notice">
          Plex isn't connected yet — showing Silo only. <Link to="/settings">Connect Plex</Link>
        </div>
      )}
      {hasQuery && sources && !sources.silo && sources.plex && (
        <div className="notice">
          Silo isn't connected yet — showing Plex only. <Link to="/settings">Connect Silo</Link>
        </div>
      )}

      {!hasQuery && <div className="status">Start typing to search your Plex and Silo libraries.</div>}

      {hasQuery && loading && <div className="status">Searching…</div>}
      {hasQuery && !loading && error && <div className="status">Search failed: {error}</div>}

      {hasQuery && !loading && !error && noSourcesConnected && (
        <div className="status">
          Neither Plex nor Silo is connected yet.
          <br />
          <Link to="/settings">Go to Settings</Link> to connect one.
        </div>
      )}

      {hasQuery && !loading && !error && !noSourcesConnected && items.length === 0 && (
        <div className="status">No titles found for "{query}".</div>
      )}

      {hasQuery && !loading && !error && items.length > 0 && (
        <div className="search-grid">
          {items.map((item) => (
            <Tile
              key={item.id}
              image={item.poster}
              title={item.title}
              genre={item.genre}
              ratingPercent={item.ratingPercent}
              year={item.year}
              owned
              badges={item.sources.map((s) => s.source)}
              onClick={() => setSelectedItem(item)}
            />
          ))}
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

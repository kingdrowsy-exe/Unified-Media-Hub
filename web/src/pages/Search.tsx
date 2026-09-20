import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MergedItem, PopularItem, Source, fetchOnDemand } from "../api.js";
import MovieDetail from "../components/MovieDetail.js";
import Tile from "../components/Tile.js";

type SourceFilter = "all" | Source;
type Playable = MergedItem | PopularItem;

const SOURCE_LABELS: Record<Source, string> = { plex: "Plex", silo: "Silo", emby: "Emby" };

export default function Search() {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const [items, setItems] = useState<MergedItem[]>([]);
  const [sources, setSources] = useState<{ plex: boolean; silo: boolean; emby: boolean } | null>(null);
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

  const noSourcesConnected = sources && !sources.plex && !sources.silo && !sources.emby;
  const missingSources = sources ? (["plex", "silo", "emby"] as const).filter((s) => !sources[s]) : [];

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
            placeholder="Search movies and shows across Plex, Silo, and Emby…"
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
            {(["all", "plex", "silo", "emby"] as const).map((s) => (
              <span key={s} className={`chip ${source === s ? "active" : ""}`} onClick={() => setSource(s)}>
                {s === "all" ? "All" : SOURCE_LABELS[s]}
              </span>
            ))}
          </div>
        )}
      </div>

      {hasQuery && !noSourcesConnected && missingSources.length > 0 && (
        <div className="notice">
          {missingSources.map((s) => SOURCE_LABELS[s]).join(" and ")}{" "}
          {missingSources.length > 1 ? "aren't" : "isn't"} connected yet — showing{" "}
          {(["plex", "silo", "emby"] as const).filter((s) => !missingSources.includes(s)).map((s) => SOURCE_LABELS[s]).join(" and ")}{" "}
          only. <Link to="/settings">Go to Settings</Link>
        </div>
      )}

      {!hasQuery && <div className="status">Start typing to search your Plex, Silo, and Emby libraries.</div>}

      {hasQuery && loading && <div className="status">Searching…</div>}
      {hasQuery && !loading && error && <div className="status">Search failed: {error}</div>}

      {hasQuery && !loading && !error && noSourcesConnected && (
        <div className="status">
          Plex, Silo, and Emby aren't connected yet.
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

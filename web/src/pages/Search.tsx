import "./search.css";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MergedItem, PopularItem, Source, fetchOnDemand } from "../api.js";
import Detail from "../ui/Detail.js";
import Icon from "../ui/Icon.js";
import PosterCard from "../ui/PosterCard.js";

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
  const connected = (["plex", "silo", "emby"] as const).filter((s) => !missingSources.includes(s));

  return (
    <div className="page">
      <div className="search__field">
        <Icon name="search" size={24} />
        <input
          className="search__input"
          type="text"
          autoFocus
          placeholder="Search movies and shows"
          aria-label="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button type="button" className="icon-btn" onClick={() => setQuery("")} aria-label="Clear search">
            <Icon name="x" size={20} />
          </button>
        )}
      </div>

      {hasQuery && (
        <div className="chips search__filters">
          {(["all", "plex", "silo", "emby"] as const).map((s) => (
            <button key={s} type="button" className="chip" aria-pressed={source === s} onClick={() => setSource(s)}>
              {s === "all" ? "All" : SOURCE_LABELS[s]}
            </button>
          ))}
        </div>
      )}

      {hasQuery && !noSourcesConnected && missingSources.length > 0 && (
        <div className="notice search__notice">
          {missingSources.map((s) => SOURCE_LABELS[s]).join(" and ")} {missingSources.length > 1 ? "aren't" : "isn't"} connected yet
          {connected.length > 0 ? `, showing ${connected.map((s) => SOURCE_LABELS[s]).join(" and ")} only` : ""}.{" "}
          <Link to="/settings">Go to Settings</Link>
        </div>
      )}

      {!hasQuery && <p className="search__empty">Type a title to search your Plex, Silo and Emby libraries.</p>}

      {hasQuery && loading && <p className="search__empty">Searching…</p>}
      {hasQuery && !loading && error && <p className="search__empty">Search failed: {error}</p>}

      {hasQuery && !loading && !error && noSourcesConnected && (
        <p className="search__empty">
          Plex, Silo and Emby aren't connected yet. <Link to="/settings">Go to Settings</Link> to connect one.
        </p>
      )}

      {hasQuery && !loading && !error && !noSourcesConnected && items.length === 0 && (
        <p className="search__empty">No titles found for "{query}".</p>
      )}

      {hasQuery && !loading && !error && items.length > 0 && (
        <div className="poster-grid search__results">
          {items.map((item) => (
            <PosterCard
              key={item.id}
              image={item.poster}
              title={item.title}
              meta={[item.year, item.genre].filter(Boolean).join(" · ")}
              tags={item.sources.map((s) => SOURCE_LABELS[s.source])}
              ratingPercent={item.ratingPercent}
              onClick={() => setSelectedItem(item)}
            />
          ))}
        </div>
      )}

      {selectedItem && (
        <Detail item={selectedItem} onClose={() => setSelectedItem(null)} onSelectSimilar={handleSelectSimilar} />
      )}
    </div>
  );
}

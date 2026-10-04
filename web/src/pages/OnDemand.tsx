import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PopularItem, fetchPopular, fetchPopularExpanded, fetchTraktRecommendations, fetchTraktWatchlist } from "../api.js";
import Detail from "../ui/Detail.js";
import Icon from "../ui/Icon.js";
import PosterCard from "../ui/PosterCard.js";
import Row from "../ui/Row.js";
import "./ondemand.css";

const SPOTLIGHT_COUNT = 6;
const SPOTLIGHT_MS = 8000;

type Kind = "all" | "movie" | "show";
type Grid = { title: string; items: PopularItem[]; loadingMore: boolean };

// Alternate movie/show/movie/show so the spotlight is not all movies and then all shows.
function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

function metaLine(item: PopularItem): string {
  return [item.year, item.genre].filter(Boolean).join(" · ");
}

function Spotlight({ items, onOpen }: { items: PopularItem[]; onOpen: (item: PopularItem) => void }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => setIndex(0), [items.length]);

  useEffect(() => {
    if (items.length < 2 || paused) return;
    const id = window.setTimeout(() => setIndex((i) => (i + 1) % items.length), SPOTLIGHT_MS);
    return () => window.clearTimeout(id);
  }, [index, items.length, paused]);

  const item = items[index];
  if (!item) return null;
  const owned = item.sources.length > 0;

  return (
    <section className="spotlight" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {items.map((it, i) => (
        <div
          key={it.id}
          className={`spotlight__bg ${i === index ? "is-on" : ""}`}
          style={{ backgroundImage: `url(${it.backdrop ?? it.poster})` }}
          aria-hidden="true"
        />
      ))}
      <div className="spotlight__fade" />
      <div className="spotlight__body" key={item.id}>
        <span className="eyebrow">{owned ? "In your libraries" : "Popular now"}</span>
        <h2 className="h1">{item.title}</h2>
        <div className="spotlight__meta">
          {item.type === "movie" ? <span className="tag">Movie</span> : <span className="tag">Series</span>}
          {item.ratingPercent !== undefined && (
            <span className="tag">
              <Icon name="star" size={12} />
              {item.ratingPercent}%
            </span>
          )}
          <span className="muted">{metaLine(item)}</span>
        </div>
        <div className="spotlight__actions">
          <button type="button" className="btn btn--primary" onClick={() => onOpen(item)}>
            <Icon name={owned ? "play" : "tag"} size={20} />
            {owned ? "Play" : "Details"}
          </button>
          {!owned && <span className="muted">Not in a connected library yet</span>}
        </div>
      </div>
      {items.length > 1 && (
        <div className="spotlight__picker" role="tablist" aria-label="Featured titles">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={it.title}
              className={`spotlight__tab ${i === index ? "is-on" : ""}`}
              onClick={() => setIndex(i)}
            >
              {i === index && !paused && <i style={{ animationDuration: `${SPOTLIGHT_MS}ms` }} />}
              {i === index && paused && <i className="is-paused" />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function OnDemand() {
  const [movies, setMovies] = useState<PopularItem[]>([]);
  const [shows, setShows] = useState<PopularItem[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [watchlist, setWatchlist] = useState<PopularItem[]>([]);
  const [recommended, setRecommended] = useState<PopularItem[]>([]);
  const [selected, setSelected] = useState<PopularItem | null>(null);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [kind, setKind] = useState<Kind>("all");
  const [ownedOnly, setOwnedOnly] = useState(false);

  useEffect(() => {
    fetchPopular()
      .then((res) => {
        setMovies(res.movies);
        setShows(res.shows);
        setConfigured(res.configured);
      })
      .catch(() => setConfigured(false));
    fetchTraktWatchlist()
      .then((res) => setWatchlist(res.items))
      .catch(() => setWatchlist([]));
    fetchTraktRecommendations()
      .then((res) => setRecommended(res.items))
      .catch(() => setRecommended([]));
  }, []);

  // "See all" asks for a larger, separately cached batch; show what is already loaded while it arrives.
  function openPopularGrid(type: "movie" | "show", title: string, fallback: PopularItem[]) {
    setGrid({ title, items: fallback, loadingMore: true });
    fetchPopularExpanded(type)
      .then((res) =>
        setGrid((prev) =>
          prev && prev.title === title ? { title, items: res.items.length > 0 ? res.items : fallback, loadingMore: false } : prev,
        ),
      )
      .catch(() => setGrid((prev) => (prev && prev.title === title ? { title, items: fallback, loadingMore: false } : prev)));
  }

  const keep = (item: PopularItem) => (kind === "all" || item.type === kind) && (!ownedOnly || item.sources.length > 0);

  const spotlight = useMemo(
    () => interleave(movies, shows).filter((i) => i.backdrop || i.poster).slice(0, SPOTLIGHT_COUNT),
    [movies, shows],
  );

  function handleSimilar(tmdbId: number, type: "movie" | "show") {
    setSelected({ id: `tmdb:${type}:${tmdbId}`, title: "", type, sources: [] });
  }

  const poster = (item: PopularItem) => (
    <PosterCard
      key={item.id}
      image={item.poster}
      title={item.title}
      meta={metaLine(item)}
      tags={item.sources.map((s) => s.source)}
      ratingPercent={item.ratingPercent}
      unowned={item.sources.length === 0}
      onClick={() => setSelected(item)}
    />
  );

  const shelves: { title: string; items: PopularItem[]; onSeeAll: () => void }[] = [
    { title: "Your Trakt watchlist", items: watchlist, onSeeAll: () => setGrid({ title: "Your Trakt watchlist", items: watchlist, loadingMore: false }) },
    { title: "Recommended for you", items: recommended, onSeeAll: () => setGrid({ title: "Recommended for you", items: recommended, loadingMore: false }) },
    { title: "Popular movies", items: movies, onSeeAll: () => openPopularGrid("movie", "Popular movies", movies) },
    { title: "Popular shows", items: shows, onSeeAll: () => openPopularGrid("show", "Popular shows", shows) },
  ];

  const visibleShelves = shelves.map((s) => ({ ...s, items: s.items.filter(keep) })).filter((s) => s.items.length > 0);

  return (
    <div className="ondemand">
      {grid ? (
        <div className="page">
          <button type="button" className="btn btn--quiet btn--sm ondemand__back" onClick={() => setGrid(null)}>
            <Icon name="back" size={20} />
            On Demand
          </button>
          <div className="ondemand__gridhead">
            <h1 className="h1">{grid.title}</h1>
            <span className="muted nums">{grid.items.filter(keep).length} titles</span>
          </div>
          <div className="poster-grid">{grid.items.filter(keep).map(poster)}</div>
          {grid.loadingMore && <div className="status">Loading more…</div>}
        </div>
      ) : (
        <>
          {spotlight.length > 0 && <Spotlight items={spotlight} onOpen={setSelected} />}

          <div className="ondemand__bar">
            <h1 className="h2">On Demand</h1>
            <div className="chips">
              {(["all", "movie", "show"] as Kind[]).map((k) => (
                <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {k === "all" ? "All" : k === "movie" ? "Movies" : "Shows"}
                </button>
              ))}
              <button type="button" className="chip" aria-pressed={ownedOnly} onClick={() => setOwnedOnly(!ownedOnly)}>
                <Icon name="check" size={16} />
                In my libraries
              </button>
            </div>
          </div>

          {configured === false && (
            <div className="ondemand__notice notice">
              TMDB isn't connected, so the popular shelves are empty. <Link to="/settings">Connect TMDB</Link>
            </div>
          )}

          <div className="ondemand__rows">
            {visibleShelves.map((s) => (
              <Row key={s.title} title={s.title} onSeeAll={s.onSeeAll}>
                {s.items.map(poster)}
              </Row>
            ))}
            {configured && visibleShelves.length === 0 && <div className="status">Nothing matches these filters.</div>}
          </div>
        </>
      )}

      {selected && <Detail item={selected} onClose={() => setSelected(null)} onSelectSimilar={handleSimilar} />}
    </div>
  );
}

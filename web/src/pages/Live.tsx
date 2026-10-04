import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ApiError, Channel, fetchChannels, streamUrlFor } from "../api.js";
import { epgProgress, formatClock, useNowPlaying } from "../hooks/useEpg.js";
import { useInView } from "../hooks/useInView.js";
import { groupCategories } from "../utils/categoryGroups.js";
import { qualityFromName, stripQualityFromName } from "../utils/quality.js";
import Icon from "../ui/Icon.js";
import MediaPlayer from "../ui/MediaPlayer.js";
import Row from "../ui/Row.js";
import CategorySheet, { LiveFilter } from "./live/CategorySheet.js";
import ChannelCard from "./live/ChannelCard.js";
import "./live.css";

const PAGE_SIZE = 60;
const ROW_SIZE = 16;
const TOP_GROUPS = 7;
const RECENT_MAX = 12;

function filterKey(f: LiveFilter): string {
  return f.kind === "all" ? "all" : f.kind === "group" ? `g:${f.group}` : `c:${f.category}`;
}

// Favorites and recently watched live in this device's local storage only.
function readIds(key: string): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(raw) ? raw.filter((n) => typeof n === "number") : [];
  } catch {
    return [];
  }
}

function useStoredIds(key: string): [number[], (next: number[]) => void] {
  const [ids, setIds] = useState<number[]>(() => readIds(key));
  const save = useCallback(
    (next: number[]) => {
      setIds(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage blocked: keep the in-memory list
      }
    },
    [key],
  );
  return [ids, save];
}

function Spotlight({ channel, onPlay }: { channel: Channel; onPlay: (c: Channel) => void }) {
  const ref = useRef<HTMLElement>(null);
  const visible = useInView(ref);
  const now = useNowPlaying(channel.id, visible);
  const progress = epgProgress(now);
  const quality = qualityFromName(channel.name);
  const name = quality ? stripQualityFromName(channel.name) : channel.name;

  return (
    <section className="spot" ref={ref}>
      <div className="spot__logo">
        {channel.icon ? <img src={channel.icon} alt="" /> : <span>{name.slice(0, 2).toUpperCase()}</span>}
      </div>
      <div className="spot__body">
        <div className="spot__tags">
          <span className="tag tag--live">LIVE</span>
          {quality && <span className={`tag ${quality === "4K" ? "tag--accent" : ""}`}>{quality}</span>}
          <span className="muted">{channel.category}</span>
        </div>
        <h1 className="h1 spot__title">{now ? now.title : name}</h1>
        <p className="muted spot__desc">{now?.description || (now ? name : "On now")}</p>
        {now && progress !== null && (
          <div className="spot__progress nums">
            <span>{formatClock(now.start)}</span>
            <div className="bar">
              <i style={{ width: `${progress * 100}%` }} />
            </div>
            <span>{formatClock(now.end)}</span>
          </div>
        )}
        <div className="spot__actions">
          <button type="button" className="btn btn--primary" onClick={() => onPlay(channel)}>
            <Icon name="play" size={20} />
            Watch now
          </button>
        </div>
      </div>
    </section>
  );
}

function NowInfo({ channel, favorite, onFavorite }: { channel: Channel; favorite: boolean; onFavorite: () => void }) {
  const now = useNowPlaying(channel.id, true);
  const progress = epgProgress(now);
  const quality = qualityFromName(channel.name);
  const name = quality ? stripQualityFromName(channel.name) : channel.name;
  return (
    <div className="nowinfo">
      <div className="nowinfo__text">
        <h1 className="h2 nowinfo__title">{now ? now.title : name}</h1>
        <p className="muted">
          {name} · {channel.category}
          {now && (
            <span className="nums">
              {" "}
              · {formatClock(now.start)} – {formatClock(now.end)}
            </span>
          )}
        </p>
        {progress !== null && (
          <div className="bar nowinfo__bar">
            <i style={{ width: `${progress * 100}%` }} />
          </div>
        )}
        {now?.description && <p className="nowinfo__desc">{now.description}</p>}
      </div>
      <button type="button" className="btn btn--sm" aria-pressed={favorite} onClick={onFavorite}>
        <Icon name="heart" size={18} />
        {favorite ? "Favorited" : "Favorite"}
      </button>
    </div>
  );
}

export default function Live() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const [playing, setPlaying] = useState<Channel | null>(null);
  const [theater, setTheater] = useState(false);
  const [view, setView] = useState<"browse" | "guide">("browse");
  const [filter, setFilter] = useState<LiveFilter>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [favorites, setFavorites] = useStoredIds("umh.favorites");
  const [recent, setRecent] = useStoredIds("umh.recent");
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChannels()
      .then((res) => {
        setChannels(res.channels);
        setCategories(res.categories);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 409) setNotConfigured(true);
        else setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => setLimit(PAGE_SIZE), [filter, query, view]);

  const byId = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);
  const groups = useMemo(() => groupCategories(categories), [categories]);

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of channels) m.set(c.category, (m.get(c.category) ?? 0) + 1);
    return m;
  }, [channels]);

  const groupCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups) m.set(g.group, g.categories.reduce((n, c) => n + (categoryCounts.get(c.name) ?? 0), 0));
    return m;
  }, [groups, categoryCounts]);

  const groupOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of groups) for (const c of g.categories) m.set(c.name, g.group);
    return m;
  }, [groups]);

  const topGroups = useMemo(
    () =>
      groups
        .filter((g) => g.group !== "Other")
        .map((g) => ({ group: g.group, count: groupCounts.get(g.group) ?? 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_GROUPS),
    [groups, groupCounts],
  );

  const inFilter = useCallback(
    (c: Channel) => {
      if (filter.kind === "category") return c.category === filter.category;
      if (filter.kind === "group") return groupOf.get(c.category) === filter.group;
      return true;
    },
    [filter, groupOf],
  );

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return channels.filter((c) => inFilter(c) && (!q || c.name.toLowerCase().includes(q)));
  }, [channels, inFilter, query]);

  const browsing = view === "browse" && filter.kind === "all" && !query.trim();
  const activeLabel = filter.kind === "all" ? "All channels" : filter.kind === "group" ? filter.group : filter.category;

  function play(channel: Channel) {
    setPlaying(channel);
    setRecent([channel.id, ...recent.filter((id) => id !== channel.id)].slice(0, RECENT_MAX));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleFavorite(channel: Channel) {
    setFavorites(favorites.includes(channel.id) ? favorites.filter((id) => id !== channel.id) : [channel.id, ...favorites]);
  }

  const favoriteChannels = favorites.map((id) => byId.get(id)).filter((c): c is Channel => !!c);
  const recentChannels = recent.map((id) => byId.get(id)).filter((c): c is Channel => !!c);
  const spotlightChannel = recentChannels[0] ?? favoriteChannels[0] ?? channels.find((c) => c.icon) ?? channels[0];

  const card = (c: Channel) => (
    <ChannelCard
      key={c.id}
      channel={c}
      active={playing?.id === c.id}
      favorite={favorites.includes(c.id)}
      onPlay={play}
      onToggleFavorite={toggleFavorite}
    />
  );

  if (loading) return <div className="status">Loading channels…</div>;
  if (notConfigured) {
    return (
      <div className="status">
        Xtream Codes isn't connected yet.
        <br />
        <Link to="/settings">Connect it in Settings</Link>
      </div>
    );
  }
  if (error) return <div className="status">Couldn't load channels: {error}</div>;

  return (
    <div className="live" ref={topRef}>
      {playing && (
        <section className={`watch ${theater ? "watch--theater" : ""}`}>
          <div className="watch__main">
            <MediaPlayer
              src={streamUrlFor("live", playing.id)}
              isHls
              live
              title={playing.name}
              subtitle={playing.category}
              theater={theater}
              onToggleTheater={() => setTheater((t) => !t)}
              onClose={() => setPlaying(null)}
            />
            <NowInfo channel={playing} favorite={favorites.includes(playing.id)} onFavorite={() => toggleFavorite(playing)} />
          </div>
          <aside className="watch__side">
            <h2 className="h3">More in {filter.kind === "all" ? playing.category : activeLabel}</h2>
            <div className="watch__list">
              {channels
                .filter((c) => (filter.kind === "all" ? c.category === playing.category : inFilter(c)))
                .slice(0, 40)
                .map((c) => (
                  <ChannelCard key={c.id} channel={c} variant="row" active={playing.id === c.id} onPlay={play} />
                ))}
            </div>
          </aside>
        </section>
      )}

      <header className="live__bar">
        <div className="live__titlebar">
          <h1 className="h2">Live TV</h1>
          <span className="muted nums">{channels.length.toLocaleString()} channels</span>
          <span className="live__spacer" />
          <div className="seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "browse"} onClick={() => setView("browse")}>
              <Icon name="grid" size={18} />
              Browse
            </button>
            <button type="button" aria-pressed={view === "guide"} onClick={() => setView("guide")}>
              <Icon name="list" size={18} />
              Guide
            </button>
          </div>
        </div>
        <div className="live__search">
          <Icon name="search" size={20} />
          <input
            className="input"
            placeholder="Search channels"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search channels"
          />
        </div>
        <div className="chips live__chips">
          <button type="button" className="chip" aria-pressed={filter.kind === "all"} onClick={() => setFilter({ kind: "all" })}>
            All
          </button>
          {topGroups.map((g) => {
            const f: LiveFilter = { kind: "group", group: g.group };
            return (
              <button
                key={g.group}
                type="button"
                className="chip"
                aria-pressed={filterKey(filter) === filterKey(f)}
                onClick={() => setFilter(f)}
              >
                {g.group}
                <span className="chip__count nums">{g.count}</span>
              </button>
            );
          })}
          <button type="button" className="chip chip--link" onClick={() => setSheetOpen(true)}>
            All categories
            <Icon name="next" size={16} />
          </button>
        </div>
      </header>

      {browsing ? (
        <div className="live__rows">
          {!playing && spotlightChannel && <Spotlight channel={spotlightChannel} onPlay={play} />}
          {recentChannels.length > 0 && <Row title="Recently watched">{recentChannels.map(card)}</Row>}
          {favoriteChannels.length > 0 && <Row title="Favorites">{favoriteChannels.map(card)}</Row>}
          {topGroups.map((g) => {
            const list = channels.filter((c) => groupOf.get(c.category) === g.group);
            return (
              <Row
                key={g.group}
                title={g.group}
                hint={`${g.count.toLocaleString()} channels`}
                onSeeAll={() => setFilter({ kind: "group", group: g.group })}
              >
                {list.slice(0, ROW_SIZE).map(card)}
              </Row>
            );
          })}
        </div>
      ) : (
        <div className="live__results">
          <div className="live__summary">
            <h2 className="h3">{query.trim() ? `Results for "${query.trim()}"` : activeLabel}</h2>
            <span className="muted nums">{results.length.toLocaleString()} channels</span>
          </div>
          {results.length === 0 ? (
            <div className="status">No channels match.</div>
          ) : view === "guide" ? (
            <div className="guide">
              {results.slice(0, limit).map((c) => (
                <ChannelCard key={c.id} channel={c} variant="row" active={playing?.id === c.id} onPlay={play} />
              ))}
            </div>
          ) : (
            <div className="live__grid">{results.slice(0, limit).map(card)}</div>
          )}
          {results.length > limit && (
            <div className="live__more">
              <button type="button" className="btn" onClick={() => setLimit(limit + PAGE_SIZE)}>
                Show more
              </button>
            </div>
          )}
        </div>
      )}

      {sheetOpen && (
        <CategorySheet
          groups={groups}
          groupCounts={groupCounts}
          categoryCounts={categoryCounts}
          total={channels.length}
          onPick={(f) => {
            setFilter(f);
            setSheetOpen(false);
          }}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}

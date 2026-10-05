import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiError, Channel, SportsGame, fetchChannels } from "../api.js";
import { usePlayer } from "../player/PlayerProvider.js";
import { useLiveGames } from "../hooks/useLiveGames.js";
import { buildGameChannelIndex } from "../utils/gameChannels.js";
import { epgProgress, formatClock, useNowPlaying } from "../hooks/useEpg.js";
import { useInView } from "../hooks/useInView.js";
import { sortAlpha } from "../utils/alpha.js";
import { groupCategories } from "../utils/categoryGroups.js";
import { qualityFromName, stripQualityFromName } from "../utils/quality.js";
import Icon from "../ui/Icon.js";
import QualityBadge from "../ui/QualityBadge.js";
import { feedQuality } from "../utils/feedQuality.js";
import SafeImg from "../ui/SafeImg.js";
import Row from "../ui/Row.js";
import CategoryGrid, { LiveFilter } from "./live/CategoryGrid.js";
import ChannelCard from "./live/ChannelCard.js";
import GameCard from "./sports/GameCard.js";
import SubCategoryGrid, { Mark } from "./live/SubCategoryGrid.js";
import "./live.css";

const PAGE_SIZE = 60;
const ROW_SIZE = 16;
const TOP_GROUPS = 7;
const RECENT_MAX = 12;

const PINS_KEY = "umh.pinnedCategories";
const DEFAULT_PIN_LABELS = new Set(["NFL", "NCAA Football", "MLB", "NHL"]);

function readPins(): string[] | null {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : null;
  } catch {
    return null;
  }
}

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
        <SafeImg src={channel.icon} fallback={<span>{name.slice(0, 2).toUpperCase()}</span>} />
      </div>
      <div className="spot__body">
        <div className="spot__tags">
          <span className="tag tag--live">LIVE</span>
          <QualityBadge channel={channel} />
          <span className="muted">{channel.category}</span>
        </div>
        <h2 className="h1 spot__title">{now ? now.title : name}</h2>
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

const LEAGUE_LABEL: Record<SportsGame["league"], string> = { nfl: "NFL", ncaaf: "NCAA Football", mlb: "MLB", nhl: "NHL" };

function GameSpotlight({ game, channel, extra, onPlay }: { game: SportsGame; channel: Channel; extra: number; onPlay: (c: Channel) => void }) {
  const side = (t: SportsGame["away"]) => (
    <div className="mu">
      <SafeImg src={t.logo} className="mu__logo" fallback={<span className="mu__logo mu__logo--blank">{t.abbr}</span>} />
      <span className="mu__name">{t.short}</span>
      <span className="mu__score nums">{t.score ?? 0}</span>
    </div>
  );
  return (
    <section className="spot spot--game">
      <div className="spot__matchup">
        {side(game.away)}
        <span className="mu__at">at</span>
        {side(game.home)}
      </div>
      <div className="spot__body">
        <div className="spot__tags">
          <span className="tag tag--live">LIVE</span>
          <span className="tag">{LEAGUE_LABEL[game.league]}</span>
          {game.network && <span className="tag">{game.network}</span>}
        </div>
        <h2 className="h1 spot__title">
          {game.away.name} at {game.home.name}
        </h2>
        <p className="muted spot__desc nums">{[game.detail, game.odds].filter(Boolean).join(" · ")}</p>
        <div className="spot__actions">
          <button type="button" className="btn btn--primary" onClick={() => onPlay(channel)}>
            <Icon name="play" size={20} />
            Watch live
          </button>
          {extra > 0 && <span className="muted nums">+{extra} more channels carry this game</span>}
        </div>
      </div>
    </section>
  );
}

function NowInfo({
  channel,
  favorite,
  onFavorite,
  resolution,
}: {
  channel: Channel;
  favorite: boolean;
  onFavorite: () => void;
  resolution: string | null;
}) {
  const now = useNowPlaying(channel.id, true);
  const progress = epgProgress(now);
  const quality = qualityFromName(channel.name);
  const name = quality ? stripQualityFromName(channel.name) : channel.name;
  const shownQuality = resolution ?? feedQuality(channel).label ?? null;
  return (
    <div className="nowinfo">
      <div className="nowinfo__text">
        <div className="nowinfo__tags">
          <span className="tag tag--live">LIVE</span>
          <span className={`tag ${shownQuality === "4K" ? "tag--accent" : ""}`}>{shownQuality ?? "Detecting…"}</span>
          <span className="tag">{channel.category}</span>
        </div>
        <h2 className="h2 nowinfo__title">{now ? now.title : name}</h2>
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

// Kept for the session so coming back to Live TV renders instantly (and the docked player never flashes).
let channelCache: { channels: Channel[]; categories: string[] } | null = null;

export default function Live() {
  const [channels, setChannels] = useState<Channel[]>(() => channelCache?.channels ?? []);
  const [categories, setCategories] = useState<string[]>(() => channelCache?.categories ?? []);
  const [loading, setLoading] = useState(!channelCache);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const player = usePlayer();
  const { channel: playing, theater, resolution } = player;
  const [view, setView] = useState<"browse" | "guide" | "categories">("browse");
  const [filter, setFilter] = useState<LiveFilter>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [flat, setFlat] = useState(false);
  const [favorites, setFavorites] = useStoredIds("umh.favorites");
  const [recent, setRecent] = useStoredIds("umh.recent");
  const [storedPins, setStoredPins] = useState<string[] | null>(readPins);
  const liveGamesRaw = useLiveGames(true);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchChannels()
      .then((res) => {
        const sorted = sortAlpha(res.channels, (c) => c.name);
        channelCache = { channels: sorted, categories: res.categories };
        setChannels(sorted);
        setCategories(res.categories);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 409) setNotConfigured(true);
        else setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => setLimit(PAGE_SIZE), [filter, query, view]);
  useEffect(() => setFlat(false), [filter]);

  const byId = useMemo(() => new Map(channels.map((c) => [c.id, c])), [channels]);
  const groups = useMemo(
    () =>
      sortAlpha(groupCategories(categories), (g) => g.group).map((g) => ({
        ...g,
        categories: sortAlpha(g.categories, (c) => c.label),
      })),
    [categories],
  );

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

  const groupLogos = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of channels) {
      if (!c.icon) continue;
      const g = groupOf.get(c.category);
      if (!g) continue;
      const list = m.get(g) ?? [];
      if (list.length < 4 && !list.includes(c.icon)) {
        list.push(c.icon);
        m.set(g, list);
      }
    }
    return m;
  }, [channels, groupOf]);

  const categoryLogos = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of channels) {
      if (!c.icon) continue;
      const list = m.get(c.category) ?? [];
      if (list.length < 3 && !list.includes(c.icon)) {
        list.push(c.icon);
        m.set(c.category, list);
      }
    }
    return m;
  }, [channels]);

  // Until the user pins something themselves, the big four US leagues are pinned in Sports.
  const pinnedCategories = useMemo(() => {
    if (storedPins) return storedPins;
    const sports = groups.find((g) => g.group === "Sports");
    return sports ? sports.categories.filter((c) => DEFAULT_PIN_LABELS.has(c.label)).map((c) => c.name) : [];
  }, [storedPins, groups]);

  function togglePin(category: string) {
    const next = pinnedCategories.includes(category) ? pinnedCategories.filter((c) => c !== category) : [...pinnedCategories, category];
    setStoredPins(next);
    try {
      localStorage.setItem(PINS_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable: pins last until the page closes
    }
  }

  const topGroups = useMemo(
    () =>
      groups
        .filter((g) => g.group !== "Other")
        .map((g) => ({ group: g.group, count: groupCounts.get(g.group) ?? 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_GROUPS)
        .sort((a, b) => a.group.localeCompare(b.group, undefined, { numeric: true, sensitivity: "base" })),
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

  const activeGroup = useMemo(() => {
    if (filter.kind === "group") return groups.find((g) => g.group === filter.group);
    if (filter.kind === "category") return groups.find((g) => g.group === groupOf.get(filter.category));
    return undefined;
  }, [filter, groups, groupOf]);

  const showTiles = filter.kind === "group" && !!activeGroup && activeGroup.categories.length > 1 && !flat && !query.trim() && view === "browse";

  const browsing = view === "browse" && filter.kind === "all" && !query.trim();
  const activeLabel =
    filter.kind === "all"
      ? "All channels"
      : filter.kind === "group"
        ? filter.group
        : (activeGroup?.categories.find((c) => c.name === filter.category)?.label ?? filter.category);

  function play(channel: Channel) {
    player.play(channel);
    setRecent([channel.id, ...recent.filter((id) => id !== channel.id)].slice(0, RECENT_MAX));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleFavorite(channel: Channel) {
    setFavorites(favorites.includes(channel.id) ? favorites.filter((id) => id !== channel.id) : [channel.id, ...favorites]);
  }

  const favoriteChannels = sortAlpha(
    favorites.map((id) => byId.get(id)).filter((c): c is Channel => !!c),
    (c) => c.name,
  );
  const recentChannels = recent.map((id) => byId.get(id)).filter((c): c is Channel => !!c);
  // Games on now (or about to start) that one of the provider's channels actually carries.
  const gameIndex = useMemo(() => buildGameChannelIndex(channels), [channels]);
  const games = useMemo(() => {
    const priority: Record<SportsGame["league"], number> = { nfl: 0, ncaaf: 1, mlb: 2, nhl: 3 };
    return liveGamesRaw
      .map((game) => ({ game, channels: gameIndex.find(game) }))
      .filter((x) => x.channels.length > 0)
      .sort(
        (a, b) =>
          Number(b.game.state === "in") - Number(a.game.state === "in") ||
          priority[a.game.league] - priority[b.game.league] ||
          a.game.startTime.localeCompare(b.game.startTime),
      );
  }, [liveGamesRaw, gameIndex]);

  // The hero is the closest live game: smallest score gap, so it is the one worth dropping into.
  const heroGame = useMemo(() => {
    const live = games.filter((x) => x.game.state === "in");
    return live.sort(
      (a, b) =>
        Math.abs((a.game.home.score ?? 0) - (a.game.away.score ?? 0)) - Math.abs((b.game.home.score ?? 0) - (b.game.away.score ?? 0)),
    )[0];
  }, [games]);

  const pinnedCats = useMemo(() => {
    const out: { name: string; label: string }[] = [];
    for (const g of groups) for (const c of g.categories) if (pinnedCategories.includes(c.name)) out.push(c);
    return sortAlpha(out, (c) => c.label);
  }, [groups, pinnedCategories]);

  const spotlightChannel = recentChannels[0] ?? favoriteChannels[0] ?? channels.find((c) => c.icon) ?? channels[0];

  // /live?play=ID (from the Sports page) starts that channel as soon as the list is loaded.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = Number(params.get("play"));
    if (!id || channels.length === 0) return;
    const target = byId.get(id);
    if (target) play(target);
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels, params]);

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
            <div ref={player.slotRef} className="player-slot" />
            <NowInfo
              channel={playing}
              favorite={favorites.includes(playing.id)}
              onFavorite={() => toggleFavorite(playing)}
              resolution={resolution}
            />
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
            <button type="button" aria-pressed={view === "categories"} onClick={() => setView("categories")}>
              <Icon name="tag" size={18} />
              Categories
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
          <button type="button" className="chip" aria-pressed={filter.kind === "all"} onClick={() => {
              setFilter({ kind: "all" });
              if (view === "categories") setView("browse");
            }}
          >
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
                onClick={() => {
                  setFilter(f);
                  setView(view === "categories" ? "browse" : view);
                }}
              >
                {g.group}
                <span className="chip__count nums">{g.count}</span>
              </button>
            );
          })}
          <button type="button" className="chip chip--link" onClick={() => setView("categories")}>
            All categories
            <Icon name="next" size={16} />
          </button>
        </div>
      </header>

      {view === "categories" ? (
        <CategoryGrid
          groups={groups}
          groupCounts={groupCounts}
          logos={groupLogos}
          total={channels.length}
          onPick={(f) => {
            setFilter(f);
            setView("browse");
          }}
        />
      ) : browsing ? (
        <div className="live__rows">
          {!playing && heroGame && (
            <GameSpotlight game={heroGame.game} channel={heroGame.channels[0]} extra={heroGame.channels.length - 1} onPlay={play} />
          )}
          {!playing && !heroGame && spotlightChannel && <Spotlight channel={spotlightChannel} onPlay={play} />}
          {games.length > 0 && (
            <Row title="Games on now" hint={`${games.filter((x) => x.game.state === "in").length} live`}>
              {games.map(({ game, channels: ch }) => (
                <div key={game.id} className="homegame">
                  <GameCard game={game} channels={ch} onWatch={play} />
                </div>
              ))}
            </Row>
          )}
          {pinnedCats.length > 0 && (
            <Row title="Your categories">
              {pinnedCats.map((c) => (
                <button key={c.name} type="button" className="pintile" onClick={() => setFilter({ kind: "category", category: c.name })}>
                  <Mark cat={c} channelLogo={categoryLogos.get(c.name)?.[0]} />
                  <span className="pintile__text">
                    <span className="pintile__name">{c.label}</span>
                    <span className="pintile__count nums">{(categoryCounts.get(c.name) ?? 0).toLocaleString()} channels</span>
                  </span>
                </button>
              ))}
            </Row>
          )}
          {recentChannels.length > 0 && <Row title="Recently watched">{recentChannels.map(card)}</Row>}
          {favoriteChannels.length > 0 && <Row title="Favorites">{favoriteChannels.map(card)}</Row>}
          {pinnedCats.map((c) => (
            <Row
              key={`pin-${c.name}`}
              title={c.label}
              hint={`${(categoryCounts.get(c.name) ?? 0).toLocaleString()} channels`}
              onSeeAll={() => setFilter({ kind: "category", category: c.name })}
            >
              {channels.filter((ch) => ch.category === c.name).slice(0, ROW_SIZE).map(card)}
            </Row>
          ))}
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
          {activeGroup && !query.trim() && (
            <nav className="crumbs" aria-label="Category path">
              <button type="button" onClick={() => setView("categories")}>
                Categories
              </button>
              <Icon name="next" size={14} />
              {filter.kind === "category" ? (
                <>
                  <button type="button" onClick={() => setFilter({ kind: "group", group: activeGroup.group })}>
                    {activeGroup.group}
                  </button>
                  <Icon name="next" size={14} />
                  <span>{activeGroup.categories.find((c) => c.name === filter.category)?.label ?? filter.category}</span>
                </>
              ) : (
                <span>{activeGroup.group}</span>
              )}
            </nav>
          )}
          {!showTiles && (
            <div className="live__summary">
              <h2 className="h3">{query.trim() ? `Results for "${query.trim()}"` : activeLabel}</h2>
              <span className="muted nums">{results.length.toLocaleString()} channels</span>
            </div>
          )}
          {showTiles && activeGroup ? (
            <SubCategoryGrid
              group={activeGroup}
              counts={categoryCounts}
              logos={categoryLogos}
              pinned={pinnedCategories}
              onTogglePin={togglePin}
              total={results.length}
              onPick={(category) => setFilter({ kind: "category", category })}
              onShowAll={() => setFlat(true)}
            />
          ) : results.length === 0 ? (
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
          {!showTiles && results.length > limit && (
            <div className="live__more">
              <button type="button" className="btn" onClick={() => setLimit(limit + PAGE_SIZE)}>
                Show more
              </button>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

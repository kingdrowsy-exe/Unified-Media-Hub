import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Channel, LeagueId, SportsGame, SportsTeam, fetchChannels, fetchScoreboard } from "../api.js";
import SafeImg from "../ui/SafeImg.js";
import Icon from "../ui/Icon.js";
import { buildGameChannelIndex } from "../utils/gameChannels.js";
import "./sports.css";

const LEAGUES: { id: LeagueId; label: string }[] = [
  { id: "nfl", label: "NFL" },
  { id: "ncaaf", label: "NCAA Football" },
  { id: "mlb", label: "MLB" },
  { id: "nhl", label: "NHL" },
];

const REFRESH_MS = 60_000;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function toKey(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function fromKey(key: string): Date {
  return new Date(Number(key.slice(0, 4)), Number(key.slice(4, 6)) - 1, Number(key.slice(6, 8)));
}

function shiftDay(key: string | null, delta: number): string {
  const d = key ? fromKey(key) : new Date();
  d.setDate(d.getDate() + delta);
  return toKey(d);
}

function dayLabel(key: string | null): string {
  if (!key || key === toKey(new Date())) return "Today";
  return fromKey(key).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

function startLabel(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return toKey(d) === toKey(new Date()) ? time : `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

function TeamLine({ team, state }: { team: SportsTeam; state: SportsGame["state"] }) {
  const dim = state === "post" && team.winner === false;
  return (
    <div className={`team ${dim ? "is-dim" : ""}`}>
      <SafeImg src={team.logo} className="team__logo" fallback={<span className="team__logo team__logo--blank">{team.abbr}</span>} />
      <span className="team__name">
        {team.rank !== undefined && <span className="team__rank nums">{team.rank}</span>}
        {team.name}
      </span>
      {state === "pre" && team.record && <span className="team__record nums">{team.record}</span>}
      {state !== "pre" && <span className="team__score nums">{team.score ?? "–"}</span>}
    </div>
  );
}

function GameCard({ game, channels }: { game: SportsGame; channels: Channel[] }) {
  const best = channels[0];
  return (
    <article className={`game ${game.state === "in" ? "is-live" : ""}`}>
      <header className="game__status">
        {game.state === "in" && <span className="tag tag--live">LIVE</span>}
        <span className={`game__detail nums ${game.state === "in" ? "is-live" : ""}`}>
          {game.state === "pre" ? startLabel(game.startTime) : game.detail}
        </span>
        {game.network && <span className="game__network">{game.network}</span>}
      </header>
      <div className="game__teams">
        <TeamLine team={game.away} state={game.state} />
        <TeamLine team={game.home} state={game.state} />
      </div>
      <footer className="game__foot">
        {game.odds && game.state !== "post" && <span className="game__odds nums">{game.odds}</span>}
        {best ? (
          <Link to={`/live?play=${best.id}`} className={`btn btn--sm ${game.state === "in" ? "btn--primary" : ""}`}>
            <Icon name="play" size={16} />
            {game.state === "post" ? "Replay channel" : game.state === "in" ? "Watch live" : "Open channel"}
            {channels.length > 1 && <span className="game__more nums">+{channels.length - 1}</span>}
          </Link>
        ) : (
          game.state !== "post" && <span className="game__none">No channel found</span>
        )}
      </footer>
    </article>
  );
}

function Section({ title, games, channelsFor }: { title: string; games: SportsGame[]; channelsFor: (g: SportsGame) => Channel[] }) {
  if (games.length === 0) return null;
  return (
    <section className="sports__section">
      <h2 className="h3">
        {title}
        <span className="muted nums"> {games.length}</span>
      </h2>
      <div className="sports__grid">
        {games.map((g) => (
          <GameCard key={g.id} game={g} channels={channelsFor(g)} />
        ))}
      </div>
    </section>
  );
}

export default function Sports() {
  const [league, setLeague] = useState<LeagueId>(() => (localStorage.getItem("umh.league") as LeagueId) || "nfl");
  const [date, setDate] = useState<string | null>(null);
  const [games, setGames] = useState<SportsGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [featuredOnly, setFeaturedOnly] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    fetchChannels()
      .then((res) => setChannels(res.channels))
      .catch(() => setChannels([]));
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("umh.league", league);
    } catch {
      // storage unavailable: the choice just will not persist
    }
  }, [league]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = () =>
      fetchScoreboard(league, date ?? undefined)
        .then((res) => {
          if (cancelled) return;
          setGames(res.games);
          setError(null);
        })
        .catch((err) => !cancelled && setError(err.message))
        .finally(() => !cancelled && setLoading(false));
    load();
    // Live scores: refresh quietly. The server caches for 45s so this never multiplies upstream calls.
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [league, date]);

  const index = useMemo(() => buildGameChannelIndex(channels), [channels]);
  const channelsFor = (g: SportsGame) => index.find(g);

  const hasFeatured = league === "ncaaf" && games.some((g) => !g.featured);
  const shown = useMemo(() => {
    const list = hasFeatured && featuredOnly ? games.filter((g) => g.featured) : games;
    const byTime = (a: SportsGame, b: SportsGame) => a.startTime.localeCompare(b.startTime);
    return {
      live: list.filter((g) => g.state === "in").sort(byTime),
      upcoming: list.filter((g) => g.state === "pre").sort(byTime),
      final: list.filter((g) => g.state === "post").sort(byTime),
      total: list.length,
    };
  }, [games, hasFeatured, featuredOnly]);

  return (
    <div className="page sports">
      <header className="sports__head">
        <h1 className="h1">Sports</h1>
        <p className="muted">Live scores and schedules, matched to the channels on your IPTV provider.</p>
      </header>

      <div className="sports__bar">
        <div className="chips" role="tablist" aria-label="League">
          {LEAGUES.map((l) => (
            <button
              key={l.id}
              type="button"
              role="tab"
              className="chip"
              aria-pressed={league === l.id}
              onClick={() => setLeague(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="sports__date">
          {hasFeatured && (
            <button type="button" className="chip" aria-pressed={featuredOnly} onClick={() => setFeaturedOnly(!featuredOnly)}>
              Top 25 games
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => setDate(shiftDay(date, -1))} aria-label="Previous day">
            <Icon name="back" />
          </button>
          <button type="button" className="chip sports__today" onClick={() => setDate(null)}>
            {dayLabel(date)}
          </button>
          <button type="button" className="icon-btn" onClick={() => setDate(shiftDay(date, 1))} aria-label="Next day">
            <Icon name="next" />
          </button>
        </div>
      </div>

      {loading && games.length === 0 ? (
        <div className="status">Loading games…</div>
      ) : error && games.length === 0 ? (
        <div className="status">Couldn't load scores: {error}</div>
      ) : shown.total === 0 ? (
        <div className="status">No games on {dayLabel(date).toLowerCase()}.</div>
      ) : (
        <div className="sports__sections">
          <Section title="Live now" games={shown.live} channelsFor={channelsFor} />
          <Section title="Upcoming" games={shown.upcoming} channelsFor={channelsFor} />
          <Section title="Final" games={shown.final} channelsFor={channelsFor} />
        </div>
      )}
    </div>
  );
}

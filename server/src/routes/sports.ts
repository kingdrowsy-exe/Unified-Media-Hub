import type { FastifyInstance } from "fastify";
import { cached } from "../cache.js";

// ESPN's public scoreboard feed (no key). Results are cached for a short window and de-duplicated in
// flight, so any number of clients refreshing the Sports page still costs one upstream call per league.
const LEAGUES = {
  nfl: { path: "football/nfl", label: "NFL" },
  ncaaf: { path: "football/college-football", label: "NCAA Football" },
  mlb: { path: "baseball/mlb", label: "MLB" },
  nhl: { path: "hockey/nhl", label: "NHL" },
} as const;

type LeagueId = keyof typeof LEAGUES;

const CACHE_SECONDS = 45;
const FETCH_TIMEOUT_MS = 10_000;

export interface SportsTeam {
  abbr: string;
  name: string;
  short: string;
  logo?: string;
  score?: number;
  /** AP/poll rank when the team is in the top 25. */
  rank?: number;
  record?: string;
  winner?: boolean;
}

export interface SportsGame {
  id: string;
  league: LeagueId;
  startTime: string;
  state: "pre" | "in" | "post";
  detail: string;
  away: SportsTeam;
  home: SportsTeam;
  network?: string;
  odds?: string;
  /** Ranked matchup or a game people are likely to watch: used to float it to the top. */
  featured: boolean;
}

interface EspnCompetitor {
  homeAway: "home" | "away";
  score?: string;
  winner?: boolean;
  curatedRank?: { current?: number };
  records?: { summary?: string }[];
  team: { abbreviation?: string; displayName?: string; shortDisplayName?: string; logo?: string };
}

interface EspnEvent {
  id: string;
  date: string;
  status: { type: { state: "pre" | "in" | "post"; shortDetail?: string } };
  competitions: {
    competitors: EspnCompetitor[];
    broadcasts?: { names?: string[] }[];
    odds?: { details?: string }[];
  }[];
}

function toTeam(c: EspnCompetitor, started: boolean): SportsTeam {
  const rank = c.curatedRank?.current;
  const score = started && c.score !== undefined ? Number(c.score) : undefined;
  return {
    abbr: c.team.abbreviation ?? "",
    name: c.team.displayName ?? "",
    short: c.team.shortDisplayName ?? c.team.displayName ?? "",
    logo: c.team.logo,
    score: Number.isFinite(score) ? score : undefined,
    rank: rank && rank <= 25 ? rank : undefined,
    record: c.records?.[0]?.summary,
    winner: c.winner,
  };
}

function normalize(league: LeagueId, event: EspnEvent): SportsGame | null {
  const comp = event.competitions[0];
  const home = comp?.competitors.find((c) => c.homeAway === "home");
  const away = comp?.competitors.find((c) => c.homeAway === "away");
  if (!comp || !home || !away) return null;

  const state = event.status.type.state;
  const started = state !== "pre";
  const homeTeam = toTeam(home, started);
  const awayTeam = toTeam(away, started);

  return {
    id: event.id,
    league,
    startTime: event.date,
    state,
    detail: event.status.type.shortDetail ?? "",
    away: awayTeam,
    home: homeTeam,
    network: comp.broadcasts?.[0]?.names?.[0],
    odds: comp.odds?.[0]?.details,
    featured: league !== "ncaaf" || !!homeTeam.rank || !!awayTeam.rank,
  };
}

async function fetchScoreboard(league: LeagueId, date?: string): Promise<SportsGame[]> {
  const url = new URL(`https://site.api.espn.com/apis/site/v2/sports/${LEAGUES[league].path}/scoreboard`);
  if (date) url.searchParams.set("dates", date);
  if (league === "ncaaf") url.searchParams.set("groups", "80");
  url.searchParams.set("limit", "200");

  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Scoreboard request failed with ${res.status}`);
  const body = (await res.json()) as { events?: EspnEvent[] };
  return (body.events ?? []).map((e) => normalize(league, e)).filter((g): g is SportsGame => g !== null);
}

export async function sportsRoutes(app: FastifyInstance) {
  app.get("/api/sports/scoreboard", async (request, reply) => {
    const { league, date } = request.query as { league?: string; date?: string };
    if (!league || !(league in LEAGUES)) {
      return reply.code(400).send({ error: "league must be one of nfl, ncaaf, mlb, nhl" });
    }
    if (date && !/^\d{8}$/.test(date)) {
      return reply.code(400).send({ error: "date must be YYYYMMDD" });
    }
    const id = league as LeagueId;
    const games = await cached(`sports:${id}:${date ?? "today"}`, CACHE_SECONDS, () => fetchScoreboard(id, date));
    return { league: id, label: LEAGUES[id].label, games };
  });
}

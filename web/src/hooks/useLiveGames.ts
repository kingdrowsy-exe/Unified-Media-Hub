import { useEffect, useState } from "react";
import { LeagueId, SportsGame, fetchScoreboard } from "../api.js";

const LEAGUES: LeagueId[] = ["nfl", "ncaaf", "mlb", "nhl"];
const REFRESH_MS = 60_000;

/**
 * Games in progress or starting within the next few hours across the four leagues, refreshed every
 * minute while mounted. The server caches each league for 45 seconds, so this stays cheap.
 */
export function useLiveGames(enabled: boolean): SportsGame[] {
  const [games, setGames] = useState<SportsGame[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = () =>
      Promise.allSettled(LEAGUES.map((l) => fetchScoreboard(l))).then((results) => {
        if (cancelled) return;
        const soon = Date.now() + 3 * 60 * 60 * 1000;
        const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value.games : []));
        setGames(
          all.filter(
            (g) => (g.state === "in" || (g.state === "pre" && new Date(g.startTime).getTime() <= soon)) && g.featured,
          ),
        );
      });
    load();
    const id = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled]);

  return games;
}

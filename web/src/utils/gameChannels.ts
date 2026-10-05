import { Channel, SportsGame } from "../api.js";
import { rankFeeds } from "./feedQuality.js";

// Provider channel names for games look like "NFL 12: Broncos vs. 49ers (10.4 4:25 PM)". A channel
// belongs to a game when it names both teams, so we normalise names (punctuation, "St" -> "State")
// and look for each team's short name in the channel name.

function norm(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\bst\b/g, "state")
    .replace(/\s+/g, " ")
    .trim()} `;
}

export interface GameChannelIndex {
  find: (game: SportsGame) => Channel[];
}

/** Builds a matcher once per channel list; each lookup is a scan over normalised names. */
export function buildGameChannelIndex(channels: Channel[]): GameChannelIndex {
  // Only channels that look like a game or a sports feed are worth scanning.
  const candidates = channels
    .filter((c) => /\b(vs|v|@|at)\b|nfl|ncaa|mlb|nhl|college|football|baseball|hockey/i.test(c.name))
    .map((c) => ({ channel: c, text: norm(c.name) }));

  return {
    find(game) {
      const needles = [game.away, game.home].map((t) => norm(t.short));
      const matches = candidates.filter(({ text }) => needles.every((n) => n.trim().length >= 3 && text.includes(n)));
      return rankFeeds(matches.map((m) => m.channel));
    },
  };
}

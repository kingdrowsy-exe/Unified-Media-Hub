import { Channel, SportsGame } from "../api.js";
import { qualityFromName } from "./quality.js";

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

const QUALITY_RANK: Record<string, number> = { "4K": 4, "1440p": 3, "1080p": 2, "720p": 1 };

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
      return matches
        .map((m) => m.channel)
        .sort((a, b) => (QUALITY_RANK[qualityFromName(b.name) ?? ""] ?? 0) - (QUALITY_RANK[qualityFromName(a.name) ?? ""] ?? 0));
    },
  };
}

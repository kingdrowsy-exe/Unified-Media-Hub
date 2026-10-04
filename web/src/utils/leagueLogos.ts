// Official league marks bundled in /public/leagues. A category gets one when its name clearly names the
// league (e.g. "NFL", "NFL Teams", "MLB (2)"); everything else falls back to a channel logo or initials.
const RULES: [RegExp, string][] = [
  [/\bwnba\b/i, "wnba"],
  [/\bnfl\b/i, "nfl"],
  [/\bncaa\b|college/i, "ncaa"],
  [/\bmlb\b/i, "mlb"],
  [/\bnhl\b/i, "nhl"],
  [/\bnba\b/i, "nba"],
  [/\bmls\b/i, "mls"],
  [/\bf1\b|formula (1|one)/i, "f1"],
  [/\bufc\b/i, "ufc"],
  [/\bepl\b|premier league/i, "epl"],
  [/la ?liga/i, "laliga"],
  [/bundesliga/i, "bundesliga"],
  [/ligue 1/i, "ligue1"],
  [/serie a\b/i, "seriea"],
  [/champions league/i, "ucl"],
];

export function leagueLogoFor(label: string): string | undefined {
  for (const [pattern, file] of RULES) {
    if (pattern.test(label)) return `/leagues/${file}.png`;
  }
  return undefined;
}

export type CategoryType = "Leagues" | "College" | "Streaming" | "Teams" | "Replays";

// Rough, name-based grouping used for the quick filter chips.
export function categoryType(label: string): CategoryType {
  if (/replays?/i.test(label)) return "Replays";
  if (/teams?\b/i.test(label)) return "Teams";
  if (/\bncaa\b|college/i.test(label)) return "College";
  if (/\+|pass|play\b|dazn|kayo|fanatiz|flosports|hbo|espn|fox one|hub|flow|stan|peacock|victory|paramount|coupang|mono|sky|tsn|cbc/i.test(label))
    return "Streaming";
  return "Leagues";
}

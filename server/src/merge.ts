import { PlexItem, plexPosterUrl } from "./clients/plex.js";
import { SiloItem, siloPosterUrl } from "./clients/silo.js";

export interface MergedItem {
  id: string;
  source: "plex" | "silo";
  title: string;
  year?: number;
  type: "movie" | "show";
  poster?: string;
  genre?: string;
  ratingPercent?: number;
  sources: { source: "plex" | "silo"; id: string }[];
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function matchKey(title: string, year?: number): string {
  return `${normalizeTitle(title)}::${year ?? ""}`;
}

function plexTypeToCommon(type: string): "movie" | "show" {
  return type === "show" ? "show" : "movie";
}

function siloTypeToCommon(type: string): "movie" | "show" {
  return type === "Series" ? "show" : "movie";
}

export function mergeLibraries(plexItems: PlexItem[], siloItems: SiloItem[]): MergedItem[] {
  const byKey = new Map<string, MergedItem>();

  for (const item of plexItems) {
    const key = matchKey(item.title, item.year);
    const score = item.audienceRating ?? item.rating;
    const entry: MergedItem = {
      id: `plex:${item.ratingKey}`,
      source: "plex",
      title: item.title,
      year: item.year,
      type: plexTypeToCommon(item.type),
      poster: plexPosterUrl(item.thumb),
      genre: item.Genre?.[0]?.tag,
      ratingPercent: score !== undefined ? Math.round(score * 10) : undefined,
      sources: [{ source: "plex", id: item.ratingKey }],
    };
    byKey.set(key, entry);
  }

  for (const item of siloItems) {
    const key = matchKey(item.Name, item.ProductionYear);
    const existing = byKey.get(key);
    if (existing) {
      existing.sources.push({ source: "silo", id: item.Id });
      existing.poster = existing.poster ?? siloPosterUrl(item.Id, item);
      continue;
    }
    byKey.set(key, {
      id: `silo:${item.Id}`,
      source: "silo",
      title: item.Name,
      year: item.ProductionYear,
      type: siloTypeToCommon(item.Type),
      poster: siloPosterUrl(item.Id, item),
      genre: item.genre,
      ratingPercent: item.ratingPercent,
      sources: [{ source: "silo", id: item.Id }],
    });
  }

  return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
}

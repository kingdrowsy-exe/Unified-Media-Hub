import { PlexItem, plexPosterUrl } from "./clients/plex.js";
import { SiloItem, siloPosterUrl } from "./clients/silo.js";
import { EmbyItem, embyPosterUrl, embyTypeToCommon } from "./clients/emby.js";

export type Source = "plex" | "silo" | "emby";

export interface MergedItem {
  id: string;
  source: Source;
  title: string;
  year?: number;
  type: "movie" | "show";
  poster?: string;
  genre?: string;
  ratingPercent?: number;
  sources: { source: Source; id: string }[];
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

function mergeIn(
  byKey: Map<string, MergedItem>,
  key: string,
  source: Source,
  id: string,
  poster: string | undefined,
  build: () => MergedItem,
) {
  const existing = byKey.get(key);
  if (existing) {
    existing.sources.push({ source, id });
    existing.poster = existing.poster ?? poster;
    return;
  }
  byKey.set(key, build());
}

export function mergeLibraries(plexItems: PlexItem[], siloItems: SiloItem[], embyItems: EmbyItem[] = []): MergedItem[] {
  const byKey = new Map<string, MergedItem>();

  for (const item of plexItems) {
    const key = matchKey(item.title, item.year);
    const score = item.audienceRating ?? item.rating;
    const poster = plexPosterUrl(item.thumb);
    mergeIn(byKey, key, "plex", item.ratingKey, poster, () => ({
      id: `plex:${item.ratingKey}`,
      source: "plex",
      title: item.title,
      year: item.year,
      type: plexTypeToCommon(item.type),
      poster,
      genre: item.Genre?.[0]?.tag,
      ratingPercent: score !== undefined ? Math.round(score * 10) : undefined,
      sources: [{ source: "plex", id: item.ratingKey }],
    }));
  }

  for (const item of siloItems) {
    const key = matchKey(item.Name, item.ProductionYear);
    const poster = siloPosterUrl(item.Id, item);
    mergeIn(byKey, key, "silo", item.Id, poster, () => ({
      id: `silo:${item.Id}`,
      source: "silo",
      title: item.Name,
      year: item.ProductionYear,
      type: siloTypeToCommon(item.Type),
      poster,
      genre: item.genre,
      ratingPercent: item.ratingPercent,
      sources: [{ source: "silo", id: item.Id }],
    }));
  }

  for (const item of embyItems) {
    const key = matchKey(item.Name, item.ProductionYear);
    const poster = embyPosterUrl(item.Id);
    mergeIn(byKey, key, "emby", item.Id, poster, () => ({
      id: `emby:${item.Id}`,
      source: "emby",
      title: item.Name,
      year: item.ProductionYear,
      type: embyTypeToCommon(item.Type),
      poster,
      genre: item.Genres?.[0],
      ratingPercent: item.CommunityRating !== undefined ? Math.round(item.CommunityRating * 10) : undefined,
      sources: [{ source: "emby", id: item.Id }],
    }));
  }

  return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
}

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

export interface Channel {
  id: number;
  name: string;
  icon?: string;
  category: string;
}

export interface EpgListing {
  id: string;
  title: string;
  start: string;
  end: string;
  description?: string;
}

export interface SettingsStatus {
  plex: boolean;
  silo: boolean;
  emby: boolean;
  xtream: boolean;
  tmdb: boolean;
  trakt: boolean;
  traktConfigured: boolean;
  plexServerName?: string;
  siloBaseUrl?: string;
  embyBaseUrl?: string;
  xtreamBaseUrl?: string;
}

export interface PopularItem {
  id: string;
  title: string;
  year?: number;
  type: "movie" | "show";
  poster?: string;
  backdrop?: string;
  genre?: string;
  ratingPercent?: number;
  sources: { source: Source; id: string }[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error?: string; service?: string; message?: string },
  ) {
    super(body.message ?? body.error ?? `Request failed with status ${status}`);
  }
}

async function parseBody(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new ApiError(res.status, await parseBody(res));
  }
  return (await res.json()) as T;
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new ApiError(res.status, await parseBody(res));
  }
  return (await res.json()) as T;
}

async function deleteJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok) {
    throw new ApiError(res.status, await parseBody(res));
  }
  return (await res.json()) as T;
}

export function fetchOnDemand(
  params: { search?: string; source?: string },
): Promise<{ items: MergedItem[]; sources: { plex: boolean; silo: boolean; emby: boolean } }> {
  const url = new URL("/api/ondemand", window.location.origin);
  if (params.search) url.searchParams.set("search", params.search);
  if (params.source) url.searchParams.set("source", params.source);
  return getJson(url.toString());
}

export function fetchChannels(): Promise<{ categories: string[]; channels: Channel[] }> {
  return getJson("/api/live/channels");
}

export function fetchEpg(streamId: number): Promise<{ listings: EpgListing[] }> {
  const url = new URL("/api/live/epg", window.location.origin);
  url.searchParams.set("streamId", String(streamId));
  return getJson(url.toString());
}

export function streamUrlFor(source: Source | "live", id: string | number): string {
  return `/api/stream/${source}/${id}`;
}

export function fetchSettingsStatus(): Promise<SettingsStatus> {
  return getJson("/api/settings/status");
}

export function fetchPopular(): Promise<{ movies: PopularItem[]; shows: PopularItem[]; configured: boolean }> {
  return getJson("/api/popular");
}

export interface TmdbCastMember {
  name: string;
  character: string;
  profilePath?: string;
}

export interface TraktRatingInfo {
  rating: number;
  votes: number;
}

export interface TraktComment {
  id: number;
  comment: string;
  spoiler: boolean;
  review: boolean;
  createdAt: string;
  likes: number;
  username: string;
}

export interface TmdbDetails {
  id: number;
  title: string;
  overview: string;
  releaseDate?: string;
  runtime?: number;
  genres: string[];
  voteAverage: number;
  backdrop?: string;
  poster?: string;
  status?: string;
  tagline?: string;
  cast: TmdbCastMember[];
  similar: { id: number; title: string; year?: number; poster?: string; type: "movie" | "show"; genre?: string; ratingPercent?: number }[];
  type: "movie" | "show";
  traktRating: TraktRatingInfo | null;
  traktComments: TraktComment[];
}

export interface SourceVersion {
  source: Source;
  id: string;
  serverName: string;
  filename?: string;
  size?: number;
  resolution?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: number;
  container?: string;
  hdr?: string;
  badges: string[];
}

export function fetchDetails(type: "movie" | "show", tmdbId: number): Promise<TmdbDetails> {
  return getJson(`/api/details/${type}/${tmdbId}`);
}

export function lookupTmdbId(
  title: string,
  year: number | undefined,
  type: "movie" | "show",
): Promise<{ tmdbId: number | null }> {
  const url = new URL("/api/tmdb-lookup", window.location.origin);
  url.searchParams.set("title", title);
  if (year) url.searchParams.set("year", String(year));
  url.searchParams.set("type", type);
  return getJson(url.toString());
}

export function fetchSources(title: string, year?: number): Promise<{ versions: SourceVersion[] }> {
  const url = new URL("/api/sources", window.location.origin);
  url.searchParams.set("title", title);
  if (year) url.searchParams.set("year", String(year));
  return getJson(url.toString());
}

export function fetchMatch(
  title: string,
  year?: number,
): Promise<{ sources: { source: Source; id: string }[] }> {
  const url = new URL("/api/match", window.location.origin);
  url.searchParams.set("title", title);
  if (year) url.searchParams.set("year", String(year));
  return getJson(url.toString());
}

export function saveTmdb(accessToken: string): Promise<{ ok: true }> {
  return postJson("/api/settings/tmdb", { accessToken });
}

export function disconnectTmdb(): Promise<{ ok: true }> {
  return deleteJson("/api/settings/tmdb");
}

export function saveSilo(baseUrl: string, username: string, password: string): Promise<{ ok: true }> {
  return postJson("/api/settings/silo", { baseUrl, username, password });
}

export function saveEmby(baseUrl: string, username: string, password: string): Promise<{ ok: true }> {
  return postJson("/api/settings/emby", { baseUrl, username, password });
}

export function disconnectEmby(): Promise<{ ok: true }> {
  return deleteJson("/api/settings/emby");
}

export function saveXtream(baseUrl: string, username: string, password: string): Promise<{ ok: true }> {
  return postJson("/api/settings/xtream", { baseUrl, username, password });
}

export function disconnectSilo(): Promise<{ ok: true }> {
  return deleteJson("/api/settings/silo");
}

export function disconnectXtream(): Promise<{ ok: true }> {
  return deleteJson("/api/settings/xtream");
}

export function disconnectPlex(): Promise<{ ok: true }> {
  return deleteJson("/api/settings/plex");
}

export function startPlexLink(): Promise<{ pinId: number; code: string; linkUrl: string }> {
  return postJson("/api/settings/plex/link/start");
}

export function pollPlexLink(pinId: number): Promise<{ linked: boolean; serverName?: string }> {
  const url = new URL("/api/settings/plex/link/status", window.location.origin);
  url.searchParams.set("pinId", String(pinId));
  return getJson(url.toString());
}

export function saveTrakt(clientId: string, clientSecret: string): Promise<{ ok: true }> {
  return postJson("/api/settings/trakt", { clientId, clientSecret });
}

export function disconnectTrakt(): Promise<{ ok: true }> {
  return deleteJson("/api/settings/trakt");
}

export function startTraktLink(): Promise<{
  userCode: string;
  verificationUrl: string;
  interval: number;
  expiresIn: number;
}> {
  return postJson("/api/settings/trakt/link/start");
}

export function pollTraktLink(): Promise<{ linked: boolean }> {
  return getJson("/api/settings/trakt/link/status");
}

export function testConnection(service: Source | "xtream" | "tmdb" | "trakt"): Promise<{ ok: true }> {
  return postJson(`/api/settings/${service}/test`);
}

export function fetchTraktWatchlist(): Promise<{ items: PopularItem[]; configured: boolean }> {
  return getJson("/api/trakt/watchlist");
}

export function fetchTraktRecommendations(): Promise<{ items: PopularItem[]; configured: boolean }> {
  return getJson("/api/trakt/recommendations");
}

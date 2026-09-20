import { NotConfiguredError, settingsStore } from "../settingsStore.js";

export interface EmbyItem {
  Id: string;
  Name: string;
  ProductionYear?: number;
  Type: string;
  Genres?: string[];
  CommunityRating?: number;
}

interface EmbyAuthResult {
  AccessToken: string;
  User: { Id: string };
}

let session: { accessToken: string; userId: string } | null = null;
// Several concurrent title searches (up to MATCH_CONCURRENCY, see library.ts) can all find
// no session yet on a cold start and each call authenticate() independently without this -
// a duplicate login burst against Emby every time the cache expires and a new batch starts.
let authenticating: Promise<{ accessToken: string; userId: string }> | null = null;

interface EmbyView {
  Id: string;
  CollectionType?: string;
}

// The library folders (e.g. "Movies", "TV Shows") almost never change, so this is worth
// caching across requests rather than re-fetching it before every /Items call.
let viewsCache: EmbyView[] | null = null;
let fetchingViews: Promise<EmbyView[]> | null = null;

function requireEmby() {
  const emby = settingsStore.getEmby();
  if (!emby) {
    throw new NotConfiguredError("emby");
  }
  return emby;
}

export function resetEmbySession() {
  session = null;
  viewsCache = null;
}

// Emby (and Jellyfin, which shares this API) identifies API clients via this header on
// every request, not just login - servers can use it to show "active sessions" per app.
const DEVICE_ID = "unified-media-hub";
const AUTH_HEADER = `MediaBrowser Client="Unified Media Hub", Device="Unified Media Hub", DeviceId="${DEVICE_ID}", Version="0.1.0"`;

async function authenticate(): Promise<{ accessToken: string; userId: string }> {
  const emby = requireEmby();
  const res = await fetch(`${emby.baseUrl}/Users/AuthenticateByName`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Emby-Authorization": AUTH_HEADER,
    },
    body: JSON.stringify({ Username: emby.username, Pw: emby.password }),
  });
  if (!res.ok) {
    throw new Error(`Emby authentication failed: ${res.status}`);
  }
  const data = (await res.json()) as EmbyAuthResult;
  session = { accessToken: data.AccessToken, userId: data.User.Id };
  return session;
}

async function getSession() {
  if (session) return session;
  if (authenticating) return authenticating;
  authenticating = authenticate().finally(() => {
    authenticating = null;
  });
  return authenticating;
}

async function embyFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const emby = requireEmby();
  const s = await getSession();
  const url = new URL(`${emby.baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("api_key", s.accessToken);
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Emby request failed: ${res.status} ${path}`);
  }
  return (await res.json()) as T;
}

export function embyTypeToCommon(type: string): "movie" | "show" {
  return type === "Series" ? "show" : "movie";
}

const POPULAR_PAGE_SIZE = 24;

async function getLibraryViews(): Promise<EmbyView[]> {
  if (viewsCache) return viewsCache;
  if (fetchingViews) return fetchingViews;
  fetchingViews = (async () => {
    const s = await getSession();
    const data = await embyFetch<{ Items: EmbyView[] }>(`/Users/${s.userId}/Views`);
    viewsCache = data.Items;
    return viewsCache;
  })().finally(() => {
    fetchingViews = null;
  });
  return fetchingViews;
}

// Querying /Items with Recursive=true walks the *entire* library tree (down through every
// season and episode) to find matching movies/series, which measured multiple minutes on
// a real-world library. Movies and Series are direct children of their library folder
// though (episodes are nested under Series, not siblings of it), so querying each media
// folder's direct children (ParentId, no Recursive) returns the same Movie/Series items
// without that walk - it's what /Views + non-recursive /Items is for. Sort/limit are then
// re-applied in JS since each folder is fetched and sorted independently.
async function fetchItems(params: Record<string, string>): Promise<EmbyItem[]> {
  const { Limit: limit, SortBy: sortBy, ...restParams } = params;
  const s = await getSession();
  const views = await getLibraryViews();
  const mediaFolders = views.filter((v) => v.CollectionType === "movies" || v.CollectionType === "tvshows");
  const folders = mediaFolders.length > 0 ? mediaFolders : views;

  const perFolder = await Promise.all(
    folders.map((folder) =>
      embyFetch<{ Items: EmbyItem[] }>(`/Users/${s.userId}/Items`, {
        ParentId: folder.Id,
        IncludeItemTypes: "Movie,Series",
        Fields: "Genres,CommunityRating",
        ...restParams,
      })
        .then((d) => d.Items)
        .catch(() => [] as EmbyItem[]),
    ),
  );

  let items = perFolder.flat();
  if (sortBy === "CommunityRating,SortName") {
    items = items.sort((a, b) => (b.CommunityRating ?? 0) - (a.CommunityRating ?? 0));
  }
  if (limit) items = items.slice(0, Number(limit));
  return items;
}

// Same bounded-page approach as Plex/Silo's "popular" list - sorted by rating, not a full
// library scan, so it stays cheap regardless of how large the Emby library is.
export async function listPopularEmbyItems(): Promise<EmbyItem[]> {
  return fetchItems({ SortBy: "CommunityRating,SortName", SortOrder: "Descending", Limit: String(POPULAR_PAGE_SIZE) });
}

// A targeted, indexed search (Emby's own item search), not a full scan - safe to run live
// per user-initiated query, same as the Plex/Silo search functions it sits alongside.
export async function searchEmbyItems(query: string): Promise<EmbyItem[]> {
  return fetchItems({ SearchTerm: query, Limit: "50" });
}

export function embyPosterUrl(itemId: string): string | undefined {
  const emby = settingsStore.getEmby();
  // Reads whatever session is already cached rather than establishing a new one - by the
  // time this is called (right after fetchItems), a session is guaranteed to exist.
  if (!emby || !session) return undefined;
  return `${emby.baseUrl}/Items/${itemId}/Images/Primary?api_key=${session.accessToken}`;
}

interface RawMediaStream {
  Type: string;
  Codec?: string;
  Height?: number;
  Channels?: number;
}

interface RawMediaSource {
  Id: string;
  Container?: string;
  Size?: number;
  Path?: string;
  MediaStreams?: RawMediaStream[];
}

export interface EmbyMediaVersion {
  itemId: string;
  mediaSourceId: string;
  filename?: string;
  size?: number;
  resolution?: string;
  videoCodec?: string;
  audioCodec?: string;
  audioChannels?: number;
  container?: string;
}

function resolutionFromHeight(height?: number): string | undefined {
  if (!height) return undefined;
  if (height >= 2000) return "2160p";
  if (height >= 1000) return "1080p";
  if (height >= 700) return "720p";
  return "480p";
}

export async function getEmbyMediaVersions(itemId: string): Promise<EmbyMediaVersion[]> {
  const s = await getSession();
  const data = await embyFetch<{ MediaSources?: RawMediaSource[] }>(`/Users/${s.userId}/Items/${itemId}`, {
    Fields: "MediaSources",
  });
  return (data.MediaSources ?? []).map((ms) => {
    const video = ms.MediaStreams?.find((st) => st.Type === "Video");
    const audio = ms.MediaStreams?.find((st) => st.Type === "Audio");
    return {
      itemId,
      mediaSourceId: ms.Id,
      filename: ms.Path?.split(/[/\\]/).pop(),
      size: ms.Size,
      resolution: resolutionFromHeight(video?.Height),
      videoCodec: video?.Codec,
      audioCodec: audio?.Codec,
      audioChannels: audio?.Channels,
      container: ms.Container,
    };
  });
}

// Unlike Silo, Emby accepts its auth token as a plain URL query param and the endpoint
// natively supports Range requests - so this can be redirected to directly (like Plex)
// instead of proxied through this server.
export async function resolveEmbyStreamUrl(itemId: string): Promise<string> {
  const emby = requireEmby();
  const s = await getSession();
  const versions = await getEmbyMediaVersions(itemId);
  const version = versions[0];
  if (!version) {
    throw new Error(`No playable media found for Emby item ${itemId}`);
  }
  const url = new URL(`${emby.baseUrl}/Videos/${itemId}/stream`);
  url.searchParams.set("Static", "true");
  url.searchParams.set("api_key", s.accessToken);
  url.searchParams.set("MediaSourceId", version.mediaSourceId);
  if (version.container) url.searchParams.set("Container", version.container);
  return url.toString();
}

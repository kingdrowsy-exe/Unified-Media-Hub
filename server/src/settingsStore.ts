import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// The packaged Electron app points this at Electron's per-user app-data folder
// (writable regardless of where the app itself is installed); running the server
// standalone falls back to a data/ folder next to the compiled server code.
const dataDir = process.env.DATA_DIR ?? path.join(__dirname, "..", "data");
const settingsPath = path.join(dataDir, "settings.json");

export interface PlexSettings {
  baseUrl: string;
  token: string;
  serverName: string;
}

export interface SiloSettings {
  baseUrl: string;
  username: string;
  password: string;
}

export interface XtreamSettings {
  baseUrl: string;
  username: string;
  password: string;
}

export interface TmdbSettings {
  accessToken: string;
}

export interface TraktSettings {
  clientId: string;
  clientSecret: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

interface Settings {
  plex?: PlexSettings;
  silo?: SiloSettings;
  xtream?: XtreamSettings;
  tmdb?: TmdbSettings;
  trakt?: TraktSettings;
}

let cache: Settings | null = null;

function load(): Settings {
  if (cache) return cache;
  if (fs.existsSync(settingsPath)) {
    cache = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Settings;
  } else {
    cache = {};
  }
  return cache;
}

function persist() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(cache, null, 2));
}

export const settingsStore = {
  getPlex(): PlexSettings | undefined {
    return load().plex;
  },
  setPlex(plex: PlexSettings) {
    load().plex = plex;
    persist();
  },
  clearPlex() {
    delete load().plex;
    persist();
  },
  getSilo(): SiloSettings | undefined {
    return load().silo;
  },
  setSilo(silo: SiloSettings) {
    load().silo = silo;
    persist();
  },
  clearSilo() {
    delete load().silo;
    persist();
  },
  getXtream(): XtreamSettings | undefined {
    return load().xtream;
  },
  setXtream(xtream: XtreamSettings) {
    load().xtream = xtream;
    persist();
  },
  clearXtream() {
    delete load().xtream;
    persist();
  },
  getTmdb(): TmdbSettings | undefined {
    return load().tmdb;
  },
  setTmdb(tmdb: TmdbSettings) {
    load().tmdb = tmdb;
    persist();
  },
  clearTmdb() {
    delete load().tmdb;
    persist();
  },
  getTrakt(): TraktSettings | undefined {
    return load().trakt;
  },
  setTrakt(trakt: TraktSettings) {
    load().trakt = trakt;
    persist();
  },
  updateTrakt(patch: Partial<TraktSettings>) {
    const existing = load().trakt;
    if (!existing) return;
    load().trakt = { ...existing, ...patch };
    persist();
  },
  clearTrakt() {
    delete load().trakt;
    persist();
  },
  status() {
    const s = load();
    return {
      plex: Boolean(s.plex),
      silo: Boolean(s.silo),
      xtream: Boolean(s.xtream),
      tmdb: Boolean(s.tmdb),
      trakt: Boolean(s.trakt?.accessToken),
      traktConfigured: Boolean(s.trakt),
      plexServerName: s.plex?.serverName,
      siloBaseUrl: s.silo?.baseUrl,
      xtreamBaseUrl: s.xtream?.baseUrl,
    };
  },
};

export class NotConfiguredError extends Error {
  constructor(public service: "plex" | "silo" | "xtream" | "tmdb" | "trakt") {
    super(`${service} is not configured yet`);
  }
}

# Unified Media Hub (Windows App)

An installable Windows desktop build of [Unified Media Hub](https://github.com/kingdrowsy-exe/Unified-Media-Player) —
the same Plex + Silo + Xtream Codes aggregator, packaged as a real `.exe` installer via
Electron instead of something you run from a terminal.

Unlike the web-app version, this bundles Node.js itself, so people installing it don't
need Node installed first. It shows up in the Start Menu and Add/Remove Programs like any
other app, and runs in its own window instead of a browser tab.

Everyone who installs it uses their **own** Plex/Silo/Xtream/TMDB/Trakt accounts — nothing
is shared between installs, and credentials are stored locally on each person's own machine
(in Electron's per-user app-data folder), never anywhere else. No key or credential of any
kind is bundled into this app or this repo.

## Setting up your accounts (first run)

The app opens on **Settings**. Log in with your own:

- **Plex** — click "Link Plex Account," enter the code at plex.tv/link. No token to copy.
- **Silo** — your Silo username and password.
- **Xtream Codes** — the server URL + username + password your IPTV provider gave you.
- **TMDB** (optional, powers the Popular Movies/Shows shelves) — free, takes under a
  minute: create an account at [themoviedb.org](https://www.themoviedb.org), then go to
  Settings → API (themoviedb.org/settings/api), request a free "Developer" API key, and
  paste the **API Read Access Token** (not the shorter "API Key") into this app's Settings.
- **Trakt** (optional, ratings/reviews + watchlist sync) — register a free app at
  trakt.tv/oauth/applications (redirect URI `urn:ietf:wg:oauth:2.0:oob`), paste its Client
  ID + Secret, then link your account via the device code it gives you.

## Building the installer

```bash
npm run install:all
npm run dist
```

`dist` builds the server + web app, then packages everything into a Windows installer
under `release/`. The installer is fairly large (~100-150MB) because it bundles a full
Chromium + Node runtime (that's what lets people run it without installing Node.js
themselves).

## Running it locally without building an installer

```bash
npm run install:all
npm start
```

Builds the server + web app and launches them in an Electron window directly.

## How it's structured

- `electron/main.js` — the Electron main process. Starts the bundled Fastify server
  in-process (imports `startServer()` from the compiled server code directly, rather than
  spawning a separate `node` process) on a fixed local port (`4173`, distinct from the
  dev project's `4000` so both can run side by side), then opens a window pointing at it.
- `server/` — a copy of the API server from the main project, with one change: the
  credentials store (`settingsStore.ts`, `plexLink.ts`) reads a `DATA_DIR` environment
  variable when set, so the packaged app can point it at Electron's proper per-user
  app-data folder instead of trying to write next to the installed binary (which usually
  isn't writable).
- `web/` — a copy of the React UI, unchanged.

This is intentionally a separate copy/repo from the main web-app project rather than a
shared codebase — the two are built and shipped differently enough (npm scripts + a
browser tab vs. a packaged installer) that keeping them independent is simpler than
threading one build around both.

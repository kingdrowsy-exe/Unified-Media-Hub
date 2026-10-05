import type { FastifyInstance, FastifyReply } from "fastify";
import { Readable, pipeline } from "node:stream";
import { resolvePlexStreamUrl } from "../clients/plex.js";
import { invalidateSiloStreamUrl, resolveSiloStreamUrl } from "../clients/silo.js";
import { resolveEmbyStreamUrl } from "../clients/emby.js";
import { liveStreamUrl } from "../clients/xtream.js";
import { audioNeedsTranscode, createTsAudioFilter } from "../tsAudioFilter.js";
import { isAudioTranscodeAvailable, peekHead, transcodeAudioToAac } from "../audioTranscode.js";
import { cachedChunk, dedupeLivePlaylist } from "../liveDedupe.js";

// Enough of a segment's start to be sure of catching its PAT/PMT (they lead each segment).
const PEEK_BYTES = 188 * 64;

function isPlaylist(contentType: string, url: string): boolean {
  return /mpegurl/i.test(contentType) || /\.m3u8(\?|$)/i.test(url);
}

// Xtream/IPTV CDNs vary in whether they send CORS headers, so hls.js (which fetches
// the manifest and every segment via XHR, unlike a plain <video src>) can be blocked
// mid-stream by a provider that doesn't. Proxying everything through this same-origin
// endpoint sidesteps that entirely, and also keeps the upstream credentials/URL out of
// the browser. Playlists are rewritten so every segment/key/nested-playlist reference
// routes back through this proxy too.
function proxiedUrl(absolute: string): string {
  return `/api/hls?u=${encodeURIComponent(absolute)}`;
}

async function fetchChunk(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`chunk ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function rewritePlaylist(body: string, baseUrl: string): string {
  const proxied = (raw: string): string => proxiedUrl(new URL(raw, baseUrl).toString());

  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) {
        return line.replace(/URI="([^"]+)"/i, (_m, uri) => `URI="${proxied(uri)}"`);
      }
      return proxied(trimmed);
    })
    .join("\n");
}

// Some providers sit several edge servers behind one playlist URL, and those servers are not in step:
// consecutive requests alternate between a playlist whose newest chunk is N and one whose newest chunk
// is N-1. A player that receives the older list sees the live edge move backwards and jumps back about a
// chunk. So the playlist handed to the player never goes backwards: if an older window arrives shortly
// after a newer one, the newer one is served again (its chunks are still valid for a while).
const MAX_REGRESSION = 6;
const PLAYLIST_MEMORY_MS = 60_000;
const lastPlaylists = new Map<string, { sequence: number; body: string; at: number }>();

function mediaSequence(playlist: string): number | null {
  const m = playlist.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
  return m ? Number(m[1]) : null;
}

function monotonicPlaylist(key: string, rewritten: string, original: string): string {
  const sequence = mediaSequence(original);
  if (sequence === null || /#EXT-X-ENDLIST/.test(original)) return rewritten;

  const now = Date.now();
  const last = lastPlaylists.get(key);
  if (last && now - last.at < PLAYLIST_MEMORY_MS && sequence < last.sequence && last.sequence - sequence <= MAX_REGRESSION) {
    return last.body;
  }

  lastPlaylists.set(key, { sequence, body: rewritten, at: now });
  if (lastPlaylists.size > 200) {
    for (const [k, v] of lastPlaylists) if (now - v.at > PLAYLIST_MEMORY_MS) lastPlaylists.delete(k);
  }
  return rewritten;
}

// Whole-segment transport-stream responses get their unplayable audio tracks stripped (see tsAudioFilter.ts),
// or converted when there is nothing else to fall back to. This changes the body length, so content-length is
// deliberately not forwarded for these.
async function sendTransportStream(raw: Readable, reply: FastifyReply) {
  const { head, stream } = await peekHead(raw, PEEK_BYTES);

  // Audio the browser can't decode with no AAC track to fall back to (e.g. AC-3-only
  // feeds) has to be converted; if that isn't possible, fall through to the filter, which
  // at least keeps the video playable.
  if (isAudioTranscodeAvailable() && audioNeedsTranscode(head)) {
    return reply.send(transcodeAudioToAac(stream));
  }

  const filter = createTsAudioFilter();
  // pipeline (not .pipe) so that when the client goes away and Fastify destroys `filter`,
  // the upstream response is torn down too instead of being left half-read.
  pipeline(stream, filter, () => {});
  return reply.send(filter);
}

async function proxyHlsResource(targetUrl: string, reply: FastifyReply, range?: string) {
  // A chunk the playlist step already downloaded (to fingerprint it) is served from memory.
  if (!range) {
    const cached = cachedChunk(targetUrl);
    if (cached) {
      reply.header("content-type", "video/mp2t");
      return sendTransportStream(Readable.from([cached]), reply);
    }
  }

  const upstream = await fetch(targetUrl, range ? { headers: { range } } : undefined);
  if (!upstream.ok && upstream.status !== 206) {
    return reply.code(502).send({ error: "Failed to reach stream" });
  }

  const contentType = upstream.headers.get("content-type") ?? "";

  if (isPlaylist(contentType, targetUrl)) {
    // Xtream panels 302/301 the given URL on to the real CDN edge server, so relative
    // segment paths in the playlist must resolve against upstream.url (post-redirect),
    // not the original targetUrl - the origin domain often doesn't serve segments at all.
    const original = await upstream.text();
    // Repeated chunks are dropped when the playlist is a plain live one; otherwise (or on any trouble) it is
    // passed through as before.
    let prepared: string | null = null;
    try {
      prepared = await dedupeLivePlaylist(targetUrl, original, upstream.url, proxiedUrl, fetchChunk);
    } catch {
      prepared = null;
    }
    const rewritten = monotonicPlaylist(targetUrl, prepared ?? rewritePlaylist(original, upstream.url), original);
    reply.header("content-type", "application/vnd.apple.mpegurl");
    reply.header("cache-control", "no-store");
    return reply.send(rewritten);
  }

  reply.header("content-type", contentType || "video/mp2t");

  const isTransportStream = /mp2t/i.test(contentType) || /\.ts(\?|$)/i.test(targetUrl);
  if (isTransportStream && !range && upstream.status === 200 && upstream.body) {
    return sendTransportStream(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]), reply);
  }

  const length = upstream.headers.get("content-length");
  if (length) reply.header("content-length", length);
  if (upstream.status === 206) {
    reply.code(206);
    reply.header("accept-ranges", "bytes");
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) reply.header("content-range", contentRange);
  }
  if (!upstream.body) return reply.send();
  return reply.send(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]));
}

export async function streamRoutes(app: FastifyInstance) {
  app.get("/api/hls", async (request, reply) => {
    const { u } = request.query as { u?: string };
    if (!u) return reply.code(400).send({ error: "Missing url" });
    return proxyHlsResource(u, reply, request.headers.range as string | undefined);
  });

  app.get("/api/stream/:source/:id", async (request, reply) => {
    const { source, id } = request.params as { source: string; id: string };

    if (source === "silo") {
      // Unlike Plex/Xtream, Silo's stream endpoint requires an Authorization header
      // (not just a token embedded in the URL), which a 302 redirect can't hand off to
      // the browser - so we proxy the video through this server instead of redirecting.
      //
      // resolveSiloStreamUrl caches the resolved URL per title (see silo.ts), so a seek -
      // which makes the browser fire a new Range request at this route - reuses the same
      // upstream playback session instead of opening a new one. That's what makes it safe
      // to forward Range/206 here and let the browser seek normally.
      const range = request.headers.range as string | undefined;
      const controller = new AbortController();
      reply.raw.on("close", () => controller.abort());

      let { url, accessToken } = await resolveSiloStreamUrl(id);
      let upstream = await fetch(url, {
        headers: range ? { Authorization: `Bearer ${accessToken}`, Range: range } : { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
      });

      // The cached URL/session can go stale server-side before our own TTL does - if Silo
      // rejects it, drop the cache entry and resolve (and retry) exactly once more.
      if (upstream.status === 401 || upstream.status === 403) {
        invalidateSiloStreamUrl(id);
        ({ url, accessToken } = await resolveSiloStreamUrl(id));
        upstream = await fetch(url, {
          headers: range ? { Authorization: `Bearer ${accessToken}`, Range: range } : { Authorization: `Bearer ${accessToken}` },
          signal: controller.signal,
        });
      }

      if ((!upstream.ok && upstream.status !== 206) || !upstream.body) {
        return reply.code(502).send({ error: "Failed to reach Silo stream" });
      }
      reply.header("content-type", upstream.headers.get("content-type") ?? "video/mp4");
      const length = upstream.headers.get("content-length");
      if (length) reply.header("content-length", length);
      if (upstream.status === 206) {
        reply.code(206);
        reply.header("accept-ranges", "bytes");
        const contentRange = upstream.headers.get("content-range");
        if (contentRange) reply.header("content-range", contentRange);
      } else {
        reply.header("accept-ranges", "bytes");
      }
      return reply.send(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]));
    }

    if (source === "live") {
      // See the comment on proxyHlsResource: live TV is HLS, played via hls.js, which
      // needs CORS on every request - so it's proxied rather than redirected.
      return proxyHlsResource(liveStreamUrl(Number(id)), reply, request.headers.range as string | undefined);
    }

    if (source === "plex") {
      const url = await resolvePlexStreamUrl(id);
      return reply.code(302).redirect(url);
    }

    if (source === "emby") {
      // Unlike Silo, Emby accepts its auth token as a plain URL query param and its
      // stream endpoint natively supports Range requests, so - like Plex - this can be a
      // redirect straight to Emby's own server instead of proxying through this one.
      const url = await resolveEmbyStreamUrl(id);
      return reply.code(302).redirect(url);
    }

    return reply.code(400).send({ error: `Unknown source: ${source}` });
  });
}

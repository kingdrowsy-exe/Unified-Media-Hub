import type { FastifyInstance, FastifyReply } from "fastify";
import { Readable, pipeline } from "node:stream";
import { resolvePlexStreamUrl } from "../clients/plex.js";
import { invalidateSiloStreamUrl, resolveSiloStreamUrl } from "../clients/silo.js";
import { resolveEmbyStreamUrl } from "../clients/emby.js";
import { liveStreamUrl } from "../clients/xtream.js";
import { audioNeedsTranscode, createTsAudioFilter } from "../tsAudioFilter.js";
import { isAudioTranscodeAvailable, peekHead, transcodeAudioToAac } from "../audioTranscode.js";

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
function rewritePlaylist(body: string, baseUrl: string): string {
  const proxied = (raw: string): string => {
    const absolute = new URL(raw, baseUrl).toString();
    return `/api/hls?u=${encodeURIComponent(absolute)}`;
  };

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

async function proxyHlsResource(targetUrl: string, reply: FastifyReply, range?: string) {
  const upstream = await fetch(targetUrl, range ? { headers: { range } } : undefined);
  if (!upstream.ok && upstream.status !== 206) {
    return reply.code(502).send({ error: "Failed to reach stream" });
  }

  const contentType = upstream.headers.get("content-type") ?? "";

  if (isPlaylist(contentType, targetUrl)) {
    // Xtream panels 302/301 the given URL on to the real CDN edge server, so relative
    // segment paths in the playlist must resolve against upstream.url (post-redirect),
    // not the original targetUrl - the origin domain often doesn't serve segments at all.
    const rewritten = rewritePlaylist(await upstream.text(), upstream.url);
    reply.header("content-type", "application/vnd.apple.mpegurl");
    reply.header("cache-control", "no-store");
    return reply.send(rewritten);
  }

  reply.header("content-type", contentType || "video/mp2t");

  // Whole-segment (non-Range) transport-stream responses get their unplayable audio tracks
  // stripped - see tsAudioFilter.ts. This changes the body length, so content-length is
  // deliberately not forwarded for these.
  const isTransportStream = /mp2t/i.test(contentType) || /\.ts(\?|$)/i.test(targetUrl);
  if (isTransportStream && !range && upstream.status === 200 && upstream.body) {
    const raw = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
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

import { createHash } from "node:crypto";

// Some live providers occasionally send the same ten seconds of video twice in a row (the next chunk is a
// repeat of the previous one, wrapped in different packaging). Players show it as the picture jumping back.
// This module fingerprints each chunk's video, drops a chunk whose video is identical to the one before it,
// and marks the timeline break so the player carries on with the next real chunk.
//
// Everything here fails open: if a playlist is not the simple shape handled below, or a chunk cannot be
// fetched or fingerprinted in time, the original playlist is used untouched.

const PACKET = 188;
const SYNC = 0x47;
const VIDEO_STREAM_TYPES = new Set([0x01, 0x02, 0x1b, 0x24]);

function payloadStart(packet: Buffer): number {
  const adaptation = (packet[3] >> 4) & 0x3;
  if (adaptation === 0 || adaptation === 2) return PACKET; // no payload
  return adaptation === 3 ? 5 + packet[4] : 4;
}

/** Hash of the video elementary stream inside a transport-stream chunk (PES headers and packaging excluded). */
export function videoFingerprint(chunk: Buffer): string | null {
  if (chunk.length < PACKET || chunk[0] !== SYNC) return null;

  let pmtPid = -1;
  let videoPid = -1;
  const scanLimit = Math.min(chunk.length, PACKET * 600);
  for (let i = 0; i + PACKET <= scanLimit && videoPid < 0; i += PACKET) {
    if (chunk[i] !== SYNC) return null;
    const packet = chunk.subarray(i, i + PACKET);
    const pid = ((packet[1] & 0x1f) << 8) | packet[2];
    const pusi = (packet[1] & 0x40) !== 0;
    if (!pusi) continue;
    const start = payloadStart(packet);
    if (start >= PACKET) continue;
    const section = start + 1 + packet[start];
    if (section + 12 > PACKET) continue;

    if (pid === 0 && packet[section] === 0x00 && pmtPid < 0) {
      const length = ((packet[section + 1] & 0x0f) << 8) | packet[section + 2];
      const end = Math.min(section + 3 + length - 4, PACKET);
      for (let p = section + 8; p + 4 <= end; p += 4) {
        const program = (packet[p] << 8) | packet[p + 1];
        if (program !== 0) {
          pmtPid = ((packet[p + 2] & 0x1f) << 8) | packet[p + 3];
          break;
        }
      }
    } else if (pid === pmtPid && packet[section] === 0x02) {
      const length = ((packet[section + 1] & 0x0f) << 8) | packet[section + 2];
      const end = Math.min(section + 3 + length - 4, PACKET);
      const programInfo = ((packet[section + 10] & 0x0f) << 8) | packet[section + 11];
      for (let p = section + 12 + programInfo; p + 5 <= end; ) {
        const esInfo = ((packet[p + 3] & 0x0f) << 8) | packet[p + 4];
        if (VIDEO_STREAM_TYPES.has(packet[p])) {
          videoPid = ((packet[p + 1] & 0x1f) << 8) | packet[p + 2];
          break;
        }
        p += 5 + esInfo;
      }
    }
  }
  if (videoPid < 0) return null;

  const hash = createHash("md5");
  let bytes = 0;
  for (let i = 0; i + PACKET <= chunk.length; i += PACKET) {
    if (chunk[i] !== SYNC) return null;
    const packet = chunk.subarray(i, i + PACKET);
    if ((((packet[1] & 0x1f) << 8) | packet[2]) !== videoPid) continue;
    let start = payloadStart(packet);
    if (start >= PACKET) continue;
    // A PES packet starts with 00 00 01 and a header whose length is in byte 8: skip it so differing timestamps
    // in otherwise identical video do not change the fingerprint.
    if ((packet[1] & 0x40) !== 0 && packet[start] === 0 && packet[start + 1] === 0 && packet[start + 2] === 1 && start + 9 < PACKET) {
      start += 9 + packet[start + 8];
      if (start >= PACKET) continue;
    }
    hash.update(packet.subarray(start));
    bytes += PACKET - start;
  }
  return bytes > 0 ? hash.digest("hex") : null;
}

// ---------- short-lived chunk cache (so a chunk fetched for fingerprinting is not downloaded again) ----------

const CACHE_MAX_BYTES = 120 * 1024 * 1024;
const CACHE_TTL_MS = 90_000;
const chunkCache = new Map<string, { data: Buffer; at: number }>();
let cacheBytes = 0;

function cachePut(url: string, data: Buffer) {
  const existing = chunkCache.get(url);
  if (existing) cacheBytes -= existing.data.length;
  chunkCache.set(url, { data, at: Date.now() });
  cacheBytes += data.length;
  const now = Date.now();
  for (const [key, value] of chunkCache) {
    if (cacheBytes <= CACHE_MAX_BYTES && now - value.at < CACHE_TTL_MS) break;
    chunkCache.delete(key);
    cacheBytes -= value.data.length;
  }
}

/** A chunk already downloaded for fingerprinting, if still fresh. */
export function cachedChunk(url: string): Buffer | undefined {
  const hit = chunkCache.get(url);
  if (!hit) return undefined;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    chunkCache.delete(url);
    cacheBytes -= hit.data.length;
    return undefined;
  }
  return hit.data;
}

// ---------- playlist handling ----------

interface Entry {
  seq: number;
  extinf: string;
  url: string; // absolute
}

interface StreamState {
  /** fingerprint by original sequence number: string = known, null = could not fingerprint */
  hashes: Map<number, string | null>;
  /** original sequence numbers dropped as repeats */
  dropped: Set<number>;
  lastSeq: number;
  lastUsed: number;
}

const states = new Map<string, StreamState>();
const STATE_IDLE_MS = 10 * 60 * 1000;
const FINGERPRINT_NEWEST = 3;
const FINGERPRINT_DEADLINE_MS = 2500;

const SIMPLE_HEADER = /^#EXT(M3U|-X-VERSION|-X-ALLOW-CACHE|-X-TARGETDURATION|-X-MEDIA-SEQUENCE)/;

function parseSimplePlaylist(body: string, baseUrl: string): { header: string[]; mediaSequence: number; entries: Entry[] } | null {
  if (/#EXT-X-ENDLIST|#EXT-X-KEY|#EXT-X-MAP|#EXT-X-BYTERANGE|#EXT-X-DISCONTINUITY|#EXT-X-STREAM-INF/.test(body)) return null;
  const lines = body.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header: string[] = [];
  const entries: Entry[] = [];
  let mediaSequence = -1;
  let pendingInf: string | null = null;
  for (const line of lines) {
    if (line.startsWith("#EXTINF")) {
      if (pendingInf) return null;
      pendingInf = line;
    } else if (line.startsWith("#")) {
      if (!SIMPLE_HEADER.test(line) || entries.length > 0 || pendingInf) return null;
      const m = line.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
      if (m) mediaSequence = Number(m[1]);
      else header.push(line);
    } else {
      if (!pendingInf) return null;
      if (!/\.ts(\?|$)/i.test(line)) return null;
      entries.push({ seq: mediaSequence + entries.length, extinf: pendingInf, url: new URL(line.trim(), baseUrl).toString() });
      pendingInf = null;
    }
  }
  if (mediaSequence < 0 || entries.length === 0 || pendingInf) return null;
  return { header, mediaSequence, entries };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Rewrites a live media playlist so repeated chunks are left out. Returns null when the playlist should be
 * served as the provider sent it.
 *
 * @param proxied turns an absolute chunk URL into the URL the player should request from this server
 * @param fetchChunk downloads a chunk; its result is cached so the player's own request is served from memory
 */
export async function dedupeLivePlaylist(
  key: string,
  body: string,
  baseUrl: string,
  proxied: (absoluteUrl: string) => string,
  fetchChunk: (absoluteUrl: string) => Promise<Buffer>,
): Promise<string | null> {
  const parsed = parseSimplePlaylist(body, baseUrl);
  if (!parsed) return null;
  const { header, entries } = parsed;

  const now = Date.now();
  for (const [k, v] of states) if (now - v.lastUsed > STATE_IDLE_MS) states.delete(k);
  let state = states.get(key);
  // A restarted channel starts counting again: forget what we knew.
  if (state && (entries[0].seq < state.lastSeq - 50 || entries[0].seq > state.lastSeq + 2000)) state = undefined;
  if (!state) {
    state = { hashes: new Map(), dropped: new Set(), lastSeq: entries[0].seq, lastUsed: now };
    states.set(key, state);
  }
  state.lastUsed = now;
  state.lastSeq = Math.max(state.lastSeq, entries[entries.length - 1].seq);

  // Fingerprint the newest few chunks that are not known yet, within a deadline.
  const deadline = now + FINGERPRINT_DEADLINE_MS;
  for (const entry of entries.slice(-FINGERPRINT_NEWEST)) {
    if (state.hashes.has(entry.seq)) continue;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const data = await withTimeout(fetchChunk(entry.url), remaining);
      cachePut(entry.url, data);
      state.hashes.set(entry.seq, videoFingerprint(data));
    } catch {
      break; // too slow or failed: later chunks are not served yet either
    }
  }

  // A chunk is a repeat when its video matches the chunk right before it.
  for (const entry of entries) {
    const mine = state.hashes.get(entry.seq);
    const before = state.hashes.get(entry.seq - 1);
    if (mine && before && mine === before) state.dropped.add(entry.seq);
  }

  // Serve chunks only up to the newest one we have an answer for (an unchecked newest chunk waits a round).
  const recent = new Set(entries.slice(-FINGERPRINT_NEWEST).map((e) => e.seq));
  let last = entries.length - 1;
  while (last >= 0 && recent.has(entries[last].seq) && !state.hashes.has(entries[last].seq)) last--;
  if (last < 0) return null;

  const kept = entries.slice(0, last + 1).filter((e) => !state.dropped.has(e.seq));
  if (kept.length === 0) return null;

  const droppedBelow = (seq: number) => {
    let n = 0;
    for (const d of state!.dropped) if (d < seq) n++;
    return n;
  };
  // Timeline breaks that have already slid out of the window.
  let discontinuitiesBefore = 0;
  for (const d of state.dropped) {
    if (state.dropped.has(d + 1)) continue; // only the end of a run of repeats carries the break
    if (d + 1 < kept[0].seq) discontinuitiesBefore++;
  }

  const out = [...header, `#EXT-X-MEDIA-SEQUENCE:${kept[0].seq - droppedBelow(kept[0].seq)}`];
  if (discontinuitiesBefore > 0) out.push(`#EXT-X-DISCONTINUITY-SEQUENCE:${discontinuitiesBefore}`);
  for (const entry of kept) {
    if (state.dropped.has(entry.seq - 1)) out.push("#EXT-X-DISCONTINUITY");
    out.push(entry.extinf, proxied(entry.url));
  }
  return out.join("\n") + "\n";
}

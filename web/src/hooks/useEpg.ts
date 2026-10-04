import { useEffect, useState } from "react";
import { EpgListing, fetchEpg } from "../api.js";
import { createLimiter } from "../utils/concurrencyLimiter.js";

// EPG is one request per channel, and a page can show hundreds of cards. Results are cached for the
// session, requests only start once a card is on screen, and at most 4 run at a time.
const cache = new Map<number, EpgListing | null>();
const inflight = new Map<number, Promise<EpgListing | null>>();
const limiter = createLimiter(4);

function load(channelId: number): Promise<EpgListing | null> {
  const existing = inflight.get(channelId);
  if (existing) return existing;
  const p = limiter(() => fetchEpg(channelId))
    .then((res) => {
      const now = res.listings[0] ?? null;
      cache.set(channelId, now);
      return now;
    })
    .finally(() => inflight.delete(channelId));
  inflight.set(channelId, p);
  return p;
}

/** Epoch milliseconds from the Xtream EPG start/end fields (unix seconds or an ISO string). */
export function epgTime(value: string): number {
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n * 1000;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function epgProgress(listing: EpgListing | null | undefined, now = Date.now()): number | null {
  if (!listing) return null;
  const start = epgTime(listing.start);
  const end = epgTime(listing.end);
  if (!start || end <= start) return null;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

export function formatClock(value: string): string {
  const t = epgTime(value);
  return t ? new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
}

/** What is on right now for a channel. Pass enabled=false until the card is visible. */
export function useNowPlaying(channelId: number, enabled: boolean): EpgListing | null {
  const [now, setNow] = useState<EpgListing | null>(() => cache.get(channelId) ?? null);

  useEffect(() => {
    if (cache.has(channelId)) {
      setNow(cache.get(channelId) ?? null);
      return;
    }
    if (!enabled) return;
    let cancelled = false;
    load(channelId)
      .then((l) => {
        if (!cancelled) setNow(l);
      })
      .catch(() => {
        // not cached, so a later render can try again
      });
    return () => {
      cancelled = true;
    };
  }, [channelId, enabled]);

  return now;
}

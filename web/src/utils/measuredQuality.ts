import { useSyncExternalStore } from "react";

// The real picture size of a channel is only known once it has been played. Whenever the player decodes a first
// frame, the label ("4K", "1080p", ...) is remembered here, on this device, and badges everywhere prefer it over
// the guess from the channel name.

const KEY = "umh.measuredQuality";
const MAX_ENTRIES = 3000;

type Store = Record<string, { label: string; at: number }>;

let cache: Store | null = null;
let version = 0;
const listeners = new Set<() => void>();

function load(): Store {
  if (cache) return cache;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    cache = raw && typeof raw === "object" ? (raw as Store) : {};
  } catch {
    cache = {};
  }
  return cache;
}

export function getMeasured(channelId: number): string | null {
  return load()[channelId]?.label ?? null;
}

export function setMeasured(channelId: number, label: string) {
  const store = load();
  if (store[channelId]?.label === label) return;
  store[channelId] = { label, at: Date.now() };
  const ids = Object.keys(store);
  if (ids.length > MAX_ENTRIES) {
    ids.sort((a, b) => store[a].at - store[b].at).slice(0, ids.length - MAX_ENTRIES).forEach((id) => delete store[id]);
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // storage unavailable: it still applies until the app closes
  }
  version++;
  listeners.forEach((fn) => fn());
}

/** Re-renders the caller whenever a new measurement is stored. */
export function useMeasuredVersion(): number {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version,
  );
}

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expiresAt > now) {
    return hit.value;
  }

  // If a request for this key is already fetching (e.g. two concurrent page loads racing
  // a cold cache), await that same in-flight call instead of firing a duplicate upstream
  // request - important for rate-limited APIs like TMDB.
  const pending = inFlight.get(key) as Promise<T> | undefined;
  if (pending) {
    return pending;
  }

  const promise = fetcher()
    .then((value) => {
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

export function bustCache(prefix: string) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

// Caps how many async calls run at once, queuing the rest - shared across every caller
// that uses the same instance (not per-call), so independent batches (e.g. Popular Movies,
// Popular Shows, Trakt Watchlist, Trakt Recommendations all refreshing their cache around
// the same time) can't each open their own concurrency window and stack on top of each
// other against the same provider.
export function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: (() => void)[] = [];

  function next() {
    if (active >= maxConcurrent) return;
    const task = queue.shift();
    if (!task) return;
    active++;
    task();
  }

  return function run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
  };
}

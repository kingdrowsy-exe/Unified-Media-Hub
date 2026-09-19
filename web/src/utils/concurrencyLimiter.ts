// Caps how many async calls can be in flight at once, queuing the rest. Used so that
// scrolling quickly through a guide list of hundreds of channels - which can bring many
// rows into view within the same frame - doesn't fire a burst of simultaneous requests
// at a third-party provider (e.g. per-channel EPG lookups against an Xtream server).
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

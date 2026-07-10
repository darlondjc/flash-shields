const DEFAULT_TIMEOUT_MS = 5000;

export interface WarmImageCacheOptions {
  timeoutMs?: number;
  onProgress?: (done: number, total: number) => void;
}

// Warms the browser's native HTTP cache for a batch of badge URLs by letting
// an <img> load in memory without ever attaching it to the DOM or reading its
// bytes. This works even though TheSportsDB's CDN sends no CORS header (which
// blocks BadgeCacheService's blob fetch + IndexedDB caching, see
// badge-cache.service.ts) — browsers are free to cache a cross-origin image's
// HTTP response for reuse, they just refuse to let script code read the
// decoded bytes.
export function warmImageCache(urls: string[], options: WarmImageCacheOptions = {}): Promise<void> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, onProgress } = options;
  const unique = Array.from(new Set(urls));
  const total = unique.length;

  if (total === 0) {
    return Promise.resolve();
  }

  let done = 0;
  return Promise.allSettled(
    unique.map(url =>
      warmOne(url, timeoutMs).then(() => {
        done++;
        onProgress?.(done, total);
      }),
    ),
  ).then(() => undefined);
}

function warmOne(url: string, timeoutMs: number): Promise<void> {
  return new Promise(resolve => {
    const img = new Image();
    const timer = setTimeout(() => resolve(), timeoutMs);
    img.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve();
    };
    img.src = url;
  });
}

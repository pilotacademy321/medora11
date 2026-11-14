/**
 * Lightweight, Session-Safe In-Memory Cache & In-Flight Request Deduplicator for Firestore.
 *
 * - Eliminates duplicate concurrent network requests for identical read keys.
 * - Avoids redundant Firestore reads on quick tab/view switches within a short TTL.
 * - Never caches rejected promises.
 * - Automatically cleared on sign-out, account switch, or permanent deletion via clearFirestoreMemoryCache().
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlightRequests = new Map<string, Promise<unknown>>();

export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T;
  }

  const existingPromise = inFlightRequests.get(key);
  if (existingPromise) {
    return existingPromise as Promise<T>;
  }

  const promise = fetcher()
    .then((result) => {
      if (ttlMs > 0) {
        memoryCache.set(key, {
          value: result,
          expiresAt: Date.now() + ttlMs,
        });
      }
      return result;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, promise);
  return promise;
}

export function invalidateCachePrefix(prefix: string): void {
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }
}

export function clearFirestoreMemoryCache(): void {
  memoryCache.clear();
  inFlightRequests.clear();
}

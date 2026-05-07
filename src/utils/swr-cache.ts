/**
 * Simple stale-while-revalidate cache.
 *
 * - Cold miss: awaits the fetcher and caches the result.
 * - Fresh hit: returns immediately from cache.
 * - Stale hit: returns the cached value immediately, triggers a
 *   background refetch so the next caller gets fresh data.
 *
 * No timers, no linked lists — staleness is checked lazily on access,
 * making this safe for edge-like runtimes.
 */

export interface SWRCacheOptions<K, V, Ctx = void> {
  /** Fetch (or re-fetch) the value for a given key. */
  fetcher: (key: K, ctx: Ctx) => Promise<V>;
  /** Milliseconds before an entry is considered stale. @default 60_000 */
  ttl?: number;
}

interface CacheEntry<V> {
  value: V;
  fetchedAt: number;
  /** True while a background refetch is in flight. */
  refreshing: boolean;
}

export class SWRCache<K, V, Ctx = void> {
  private map = new Map<K, CacheEntry<V>>();
  private fetcher: (key: K, ctx: Ctx) => Promise<V>;
  private ttl: number;

  constructor(options: SWRCacheOptions<K, V, Ctx>) {
    this.fetcher = options.fetcher;
    this.ttl = options.ttl ?? 60_000;
  }

  /**
   * Get a value, fetching on miss or staleness.
   *
   * @param key    Cache key
   * @param ctx    Context forwarded to the fetcher (e.g. request, logger)
   * @param after  Optional scheduler for the background refetch — pass
   *               Next.js `after` (from `next/server`) to guarantee the
   *               refetch completes even after the response is sent.
   *               When omitted the refetch runs as a detached promise.
   */
  async get(key: K, ctx: Ctx, after?: (callback: () => Promise<unknown>) => void): Promise<V> {
    const entry = this.map.get(key);
    const now = Date.now();

    if (!entry) {
      // Cold miss — must await
      const value = await this.fetcher(key, ctx);
      this.map.set(key, { value, fetchedAt: now, refreshing: false });
      return value;
    }

    if (now - entry.fetchedAt < this.ttl) {
      return entry.value; // fresh
    }
    // Stale — return cached value, kick off background refetch
    if (!entry.refreshing) {
      entry.refreshing = true;
      const doRefresh = () =>
        this.fetcher(key, ctx).then(
          (value) => {
            this.map.set(key, { value, fetchedAt: Date.now(), refreshing: false });
            return value;
          },
          () => {
            // Refetch failed — keep stale value, allow retry on next access
            entry.refreshing = false;
          }
        );

      if (after) {
        after(doRefresh);
      } else {
        void doRefresh().catch(() => {
          console.error('Failed to refresh SWR cache');
        });
      }
    }
    return entry.value;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

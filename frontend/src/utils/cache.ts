/**
 * CacheStore — Fast in-memory + AsyncStorage cache manager with 5-minute TTL.
 * Enables instant startup (<20ms) and silent background data refreshes.
 */
import { storage } from "./storage";

// Cache TTL: 10 seconds in __DEV__ mode (instant visibility of local admin uploads), 5 minutes in Production
const CACHE_TTL_MS = __DEV__ ? 10 * 1000 : 5 * 60 * 1000;

interface CacheEntry<T> {
  timestamp: number;
  data: T;
}

const memoryCache = new Map<string, CacheEntry<any>>();

export const cacheStore = {
  /**
   * Get cached entry instantly from memory or AsyncStorage.
   * Returns undefined if cache is missing or expired beyond TTL.
   */
  async get<T>(key: string): Promise<T | undefined> {
    const now = Date.now();

    // 1. Memory lookup (<1ms)
    const inMem = memoryCache.get(key);
    if (inMem) {
      if (now - inMem.timestamp < CACHE_TTL_MS) {
        return inMem.data as T;
      }
    }

    // 2. Storage lookup (<15ms)
    try {
      const raw = await storage.getItem(`cache.${key}`, "");
      if (raw) {
        const parsed: CacheEntry<T> = JSON.parse(String(raw));
        if (parsed && parsed.data && now - parsed.timestamp < CACHE_TTL_MS) {
          memoryCache.set(key, parsed);
          return parsed.data;
        }
      }
    } catch {
      // Ignore JSON parse errors
    }

    return undefined;
  },

  /**
   * Store data in memory and persist asynchronously to AsyncStorage.
   */
  set<T>(key: string, data: T): void {
    const entry: CacheEntry<T> = { timestamp: Date.now(), data };
    memoryCache.set(key, entry);
    storage.setItem(`cache.${key}`, JSON.stringify(entry)).catch(() => {});
  },

  /**
   * Clear cache for key or all keys.
   */
  clear(key?: string): void {
    if (key) {
      memoryCache.delete(key);
      storage.removeItem(`cache.${key}`).catch(() => {});
    } else {
      memoryCache.clear();
      storage.removeItem("cache.search_master_en").catch(() => {});
      storage.removeItem("cache.search_master_te").catch(() => {});
      storage.removeItem("cache.search__en").catch(() => {});
      storage.removeItem("cache.sermons_all").catch(() => {});
      storage.removeItem("cache.sermons_{}").catch(() => {});
    }
  },
};

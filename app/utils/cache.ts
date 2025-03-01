/**
 * Simple in-memory cache implementation
 */
type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

class Cache {
  private cache: Map<string, CacheEntry<any>> = new Map();

  /**
   * Get an item from the cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    
    // Return null if no entry or entry is expired
    if (!entry || entry.expiresAt < Date.now()) {
      if (entry) {
        this.cache.delete(key);
      }
      return null;
    }
    
    return entry.data;
  }

  /**
   * Set an item in the cache with an expiration time
   */
  set<T>(key: string, data: T, ttlSeconds: number = 60 * 60): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlSeconds * 1000),
    });
  }

  /**
   * Remove an item from the cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }
}

// Export a singleton instance
export const cache = new Cache(); 
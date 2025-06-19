import Redis from 'ioredis';

/**
 * Redis cache configuration and client setup
 */
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

// Create Redis client with proper configuration
const createRedisClient = () => {
  const redis = new Redis(REDIS_URL, {
    password: REDIS_PASSWORD,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    // Handle connection errors gracefully
    onClusterReady: () => console.log('Redis cluster ready'),
    onFailover: () => console.log('Redis failover occurred'),
    onNodeError: (err, address) => console.error(`Redis node error at ${address}:`, err),
  });

  redis.on('connect', () => {
    console.log('Connected to Redis');
  });

  redis.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  redis.on('close', () => {
    console.log('Redis connection closed');
  });

  return redis;
};

// Singleton Redis client
let redisClient: Redis | null = null;

/**
 * Get or create Redis client
 */
const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
};

/**
 * Redis cache class with automatic serialization/deserialization
 */
export class RedisCache {
  private client: Redis;
  private defaultTTL: number;

  constructor(ttlSeconds: number = 3600) {
    this.client = getRedisClient();
    this.defaultTTL = ttlSeconds;
  }

  /**
   * Get data from Redis cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.client.get(key);
      if (!data) {
        return null;
      }
      return JSON.parse(data) as T;
    } catch (error) {
      console.error(`Redis get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set data in Redis cache
   */
  async set<T>(key: string, data: T, ttlSeconds?: number): Promise<boolean> {
    try {
      const ttl = ttlSeconds || this.defaultTTL;
      const serializedData = JSON.stringify(data);
      const result = await this.client.setex(key, ttl, serializedData);
      return result === 'OK';
    } catch (error) {
      console.error(`Redis set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete data from Redis cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(key);
      return result === 1;
    } catch (error) {
      console.error(`Redis delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if key exists in Redis cache
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Redis exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      console.error(`Redis TTL error for key ${key}:`, error);
      return -1;
    }
  }

  /**
   * Set TTL for an existing key
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(key, ttlSeconds);
      return result === 1;
    } catch (error) {
      console.error(`Redis expire error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get multiple keys at once
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const results = await this.client.mget(...keys);
      return results.map(result => {
        if (!result) return null;
        try {
          return JSON.parse(result) as T;
        } catch {
          return null;
        }
      });
    } catch (error) {
      console.error(`Redis mget error for keys ${keys.join(', ')}:`, error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple key-value pairs at once
   */
  async mset<T>(keyValuePairs: Record<string, T>, ttlSeconds?: number): Promise<boolean> {
    try {
      const ttl = ttlSeconds || this.defaultTTL;
      const pipeline = this.client.pipeline();
      
      Object.entries(keyValuePairs).forEach(([key, value]) => {
        const serializedData = JSON.stringify(value);
        pipeline.setex(key, ttl, serializedData);
      });
      
      const results = await pipeline.exec();
      return results?.every(result => result[1] === 'OK') || false;
    } catch (error) {
      console.error('Redis mset error:', error);
      return false;
    }
  }

  /**
   * Clear all cache data (use with caution)
   */
  async clear(): Promise<boolean> {
    try {
      await this.client.flushall();
      return true;
    } catch (error) {
      console.error('Redis clear error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    keys: number;
    memory: string;
  }> {
    try {
      const info = await this.client.info('memory');
      const keyCount = await this.client.dbsize();
      const memoryMatch = info.match(/used_memory_human:(.+)/);
      
      return {
        connected: this.client.status === 'ready',
        keys: keyCount,
        memory: memoryMatch ? memoryMatch[1].trim() : 'unknown'
      };
    } catch (error) {
      console.error('Redis stats error:', error);
      return {
        connected: false,
        keys: 0,
        memory: 'unknown'
      };
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    try {
      await this.client.quit();
      redisClient = null;
    } catch (error) {
      console.error('Redis close error:', error);
    }
  }
}

// Export singleton instance with default 1 hour TTL
export const redisCache = new RedisCache(3600);

// Export specific cache instances for different data types
export const productCache = new RedisCache(3600); // 1 hour for products
export const mediaCache = new RedisCache(7200); // 2 hours for media
export const collectionCache = new RedisCache(3600); // 1 hour for collections
export const pageCache = new RedisCache(1800); // 30 minutes for pages 
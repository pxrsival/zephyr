import { Redis } from "@upstash/redis";

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || "",
  token: process.env.UPSTASH_REDIS_REST_TOKEN || ""
});

export interface TrendingTopic {
  hashtag: string;
  count: number;
}

const TRENDING_TOPICS_KEY = "trending:topics";
const TRENDING_TOPICS_BACKUP_KEY = "trending:topics:backup";
const CACHE_TTL = 3600; // 1 hour in seconds
const BACKUP_TTL = 86400; // 24 hours in seconds

export const trendingTopicsCache = {
  async get(): Promise<TrendingTopic[] | null> {
    try {
      const cached = await redis.get(TRENDING_TOPICS_KEY);
      // Handle both string and direct object responses
      if (!cached) return null;

      if (Array.isArray(cached)) {
        return cached as TrendingTopic[];
      }

      if (typeof cached === "string") {
        return JSON.parse(cached) as TrendingTopic[];
      }

      console.error("Unexpected cache value type:", typeof cached);
      return null;
    } catch (error) {
      console.error("Error getting trending topics from cache:", error);
      return this.getBackup();
    }
  },

  async getBackup(): Promise<TrendingTopic[] | null> {
    try {
      const backup = await redis.get(TRENDING_TOPICS_BACKUP_KEY);
      if (!backup) return null;

      if (Array.isArray(backup)) {
        return backup as TrendingTopic[];
      }

      if (typeof backup === "string") {
        return JSON.parse(backup) as TrendingTopic[];
      }

      console.error("Unexpected backup value type:", typeof backup);
      return null;
    } catch (error) {
      console.error("Error getting trending topics backup:", error);
      return null;
    }
  },

  async set(topics: TrendingTopic[]): Promise<void> {
    try {
      // Explicitly stringify the data
      const stringifiedTopics = JSON.stringify(topics);

      await redis.set(TRENDING_TOPICS_KEY, stringifiedTopics, {
        ex: CACHE_TTL
      });

      await redis.set(TRENDING_TOPICS_BACKUP_KEY, stringifiedTopics, {
        ex: BACKUP_TTL
      });

      await redis.set(
        `${TRENDING_TOPICS_KEY}:last_updated`,
        Date.now().toString(),
        {
          ex: BACKUP_TTL
        }
      );
    } catch (error) {
      console.error("Error setting trending topics cache:", error);
    }
  },

  async invalidate(): Promise<void> {
    try {
      await redis.del(TRENDING_TOPICS_KEY);
    } catch (error) {
      console.error("Error invalidating trending topics cache:", error);
    }
  },

  async shouldRefresh(): Promise<boolean> {
    try {
      const lastUpdated = await redis.get(
        `${TRENDING_TOPICS_KEY}:last_updated`
      );
      if (!lastUpdated) return true;

      const timestamp =
        typeof lastUpdated === "string"
          ? Number.parseInt(lastUpdated, 10)
          : Number(lastUpdated);

      if (Number.isNaN(timestamp)) return true;

      const timeSinceUpdate = Date.now() - timestamp;
      return timeSinceUpdate > (CACHE_TTL * 1000) / 2;
    } catch {
      return true;
    }
  },

  async warmCache(): Promise<void> {
    try {
      const shouldWarm = await this.shouldRefresh();
      if (!shouldWarm) return;
      await this.refreshCache();
    } catch (error) {
      console.error("Error warming trending topics cache:", error);
    }
  },

  refreshCache: null as unknown as () => Promise<TrendingTopic[]>
};

import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';
import { MODULE_OPTIONS_TOKEN } from './module.builder';

@Injectable()
export class RedisService implements OnModuleInit {
  logger = new Logger(RedisService.name);
  private readonly cachedClient: Redis;
  private readonly subscriberClient: Redis;

  constructor(@Inject(MODULE_OPTIONS_TOKEN) private readonly config:RedisOptions) {
    this.cachedClient = new Redis(this.config);
    this.subscriberClient = new Redis(this.config);

    this.cachedClient
      .ping()
      .then(() => this.logger.log('Cached Redis is Connected'))
      .catch((e) => {
        this.logger.error('Error connecting to cached Redis', e);
      });
  }
  async onModuleInit() {
    this.logger.log('Flushing cached Redis database');
    await this.cachedClient.flushdb();
  }

  private getClient(): Redis {
  
    return this.cachedClient;
  }

  async set<T>(
    key: string,
    value: T,
    ttl?: number,
  ): Promise<void> {
    if (ttl) {
      await this.getClient().set(
        key,
        JSON.stringify(value),
        'EX',
        ttl,
      );
    } else {
      await this.getClient().set(key, JSON.stringify(value));
    }
  }
  async rPush<T>(
    key: string,
    value: T,
  ): Promise<void> {
    await this.getClient().rpush(key, JSON.stringify(value));
  }
  async lPush<T>(
    key: string,
    value: T,
  ): Promise<void> {
    await this.getClient().lpush(key, JSON.stringify(value));
  }
  async lPop<T>(
    key: string,
  ): Promise<T | null> {
    const data = await this.getClient().lpop(key);
    return data ? (JSON.parse(data) as T) : null;
  }
  async rPop<T>(
    key: string,
  ): Promise<T | null> {
    const data = await this.getClient().rpop(key);
    return data ? (JSON.parse(data) as T) : null;
  }
  async subscribe(
    channel: string,
    callback: (message: string) => void | Promise<void>,
  ) {
    //TODO:fix this logi later it looks sussy
    await this.subscriberClient.subscribe(channel);
    this.subscriberClient.on('message', (channel, message) => {
      if (channel === channel) {
        void callback(message);
      }
    });
  }
  //TODO:same for this
  async publish(
    channel: string,
    message: string,
  ) {
    await this.getClient().publish(channel, message);
  }
  async getRange<T>(
    key: string,
    start: number = 0,
    end: number = -1,
  ): Promise<Array<T>> {
    const data = await this.getClient().lrange(key, start, end);
    return data.map((d) => JSON.parse(d) as T);
  }

  async get<T>(
    key: string,
  ): Promise<T | null> {
    const data = await this.getClient().get(key);
    return data ? (JSON.parse(data) as T) : null;
  }

  async getMany<T>(
    key: string,
  ): Promise<Array<T>> {
    const data = await this.getClient().get(key);
    return data ? (JSON.parse(data) as Array<T>) : [];
  }

  async del(
    key: string,
  ): Promise<void> {
    await this.getClient().del(key);
  }
  async ttl(
    key: string,
  ): Promise<number> {
    return this.getClient().ttl(key);
  }

  async sAdd(
    key: string,
    value: string,
  ): Promise<number> {
    return this.getClient().sadd(key, value);
  }

  async sIsMember(
    key: string,
    value: string,
  ): Promise<number> {
    return this.getClient().sismember(key, value);
  }

  async sMembers(
    key: string,
  ): Promise<string[]> {
    return this.getClient().smembers(key);
  }
  async zIncrBy(
    key: string,
    increment: number,
    member: string,
  ): Promise<string> {
    return this.getClient().zincrby(key, increment, member);
  }
  async zScore(
    key: string,
    member: string,
  ): Promise<string | null> {
    return this.getClient().zscore(key, member);
  }
  async zCard(
    key: string,
  ): Promise<number> {
    return this.getClient().zcard(key);
  }
  async zRange(
    key: string,
    start: number,
    stop: number,
  ): Promise<string[]> {
    return this.getClient().zrange(key, start, stop);
  }
  async 

  async hIncrBy(
    key: string,
    field: string,
    increment: number = 1,
  ): Promise<number> {
    return this.getClient().hincrby(key, field, increment);
  }

  async hSet(
    key: string,
    field: string,
    value: string | number,
  ): Promise<number> {
    return this.getClient().hset(key, field, value.toString());
  }

  async hGetAll(
    key: string,
  ): Promise<Record<string, string>> {
    return this.getClient().hgetall(key);
  }

  async hDel(
    key: string,
    ...fields: string[]
  ): Promise<number> {
    return this.getClient().hdel(key, ...fields);
  }

  async sRem(
    key: string,
    ...members: string[]
  ): Promise<number> {
    return this.getClient().srem(key, ...members);
  }

  async zRem(
    key: string,
    ...members: string[]
  ): Promise<number> {
    return this.getClient().zrem(key, ...members);
  }

  async hGet(
    key: string,
    field: string,
  ): Promise<string | null> {
    return this.getClient().hget(key, field);
  }

  async sCard(
    key: string,
  ): Promise<number> {
    return this.getClient().scard(key);
  }

  async zAdd(
    key: string,
    members: Array<{ score: number; value: string }>,
  ): Promise<number> {
    const args: (string | number)[] = [];
    members.forEach((member) => {
      args.push(member.score, member.value);
    });
    return this.getClient().zadd(key, ...args);
  }
  async zRevRange(
    key: string,
    start: number,
    stop: number,): Promise<string[]> {
    return this.getClient().zrevrange(key, start, stop);
  }

  async zRevRangeWithScores(
    key: string,
    start: number,
    stop: number,
  ): Promise<Array<{ score: number; value: string }>> {
    const result = await this.getClient().zrevrange(
      key,
      start,
      stop,
      'WITHSCORES',
    );
    const formatted: Array<{ score: number; value: string }> = [];

    for (let i = 0; i < result.length; i += 2) {
      formatted.push({
        value: result[i],
        score: parseFloat(result[i + 1]),
      });
    }

    return formatted;
  }

  /**
   * Deletes all Redis keys matching a specific pattern
   * @param pattern The pattern to match keys against (e.g., "user:*:profile")
   * @returns Number of keys deleted
   */
  async deleteByPattern(
    pattern: string,
  ): Promise<number> {
    let cursor = '0';
    let deleteCount = 0;
    const client = this.getClient();

    do {
      // Scan for keys matching the pattern
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );

      cursor = nextCursor;

      // Delete found keys if any
      if (keys.length > 0) {
        const deletedCount = await client.del(...keys);
        deleteCount += deletedCount;
      }
    } while (cursor !== '0'); // Continue until cursor returns to 0

    this.logger.debug(
      `Deleted ${deleteCount} keys matching pattern: ${pattern}`,
    );
    return deleteCount;
  }

  /**
   * Checks if any Redis keys matching a specific pattern exist
   * @param pattern The pattern to match keys against (e.g., "user:*:profile")
   * @returns True if any key matches the pattern, false otherwise
   */
  async existsByPattern(
    pattern: string,
  ): Promise<boolean> {
    let cursor = '0';
    const client = this.getClient();

    do {
      // Scan for keys matching the pattern
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );

      cursor = nextCursor;

      // If any keys are found, return true immediately
      if (keys.length > 0) {
        this.logger.debug(`Found keys matching pattern: ${pattern}`);
        return true;
      }
    } while (cursor !== '0'); // Continue until cursor returns to 0

    this.logger.debug(`No keys found matching pattern: ${pattern}`);
    return false;
  }

  /**
   * Gets all values from Redis keys matching a specific pattern
   * @param pattern The pattern to match keys against (e.g., "user:*:profile")
   * @returns Array of parsed values from matching keys
   */
  async getByPattern<T>(
    pattern: string,
  ): Promise<T[]> {
    let cursor = '0';
    const results: Array<T> = [];
    const client = this.getClient();
    do {
      // Scan for keys matching the pattern
      const [nextCursor, keys] = await client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );

      cursor = nextCursor;

      // Get values for found keys
      if (keys.length > 0) {
        const values = await client.mget(...keys);

        // Parse and add non-null values to results
        for (const value of values) {
          if (value !== null) {
            try {
              const res = JSON.parse(value) as T;

              results.push(res);
            } catch (error) {
              this.logger.error(`Failed to parse value: ${value}`, error);
            }
          }
        }
      }
    } while (cursor !== '0'); // Continue until cursor returns to 0

    this.logger.debug(
      `Retrieved ${results.length} values matching pattern: ${pattern}`,
    );
    return results;
  }
}

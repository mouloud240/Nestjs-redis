# NestJS Redis Module

A configurable NestJS module to integrate Redis, built on top of `ioredis`. This module provides a `RedisService` with a comprehensive set of methods to interact with your Redis server.

## Features

- Easy integration with NestJS applications.
- Built on the robust and performant `ioredis` library.
- Configurable using static `register` or dynamic `registerAsync` methods.
- Global module support.
- A rich `RedisService` that covers most Redis commands for various data structures.

## Usage

### 1. Import the Module

You can import `RedisModule` into your application's root module (`app.module.ts`).

#### Static Configuration

For simple setups, you can configure the module statically using `register`.

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { RedisModule } from './redis/redis.module'; // Adjust path as needed

@Module({
  imports: [
    RedisModule.register({
      host: 'localhost',
      port: 6379,
      // You can add any other ioredis options here
    }),
  ],
})
export class AppModule {}
```

#### Asynchronous Configuration

For more complex setups, like when you need to fetch configuration from a `ConfigService`, you can use `registerAsync`.

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisModule } from './redis/redis.module'; // Adjust path as needed

@Module({
  imports: [
    ConfigModule.forRoot(),
    RedisModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        host: configService.get<string>('REDIS_HOST'),
        port: configService.get<number>('REDIS_PORT'),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

#### Global Module

To make the `RedisService` available in all modules without importing `RedisModule` everywhere, you can register it as a global module.

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { RedisModule } from './redis/redis.module'; // Adjust path as needed

@Module({
  imports: [
    RedisModule.register({
      isGlobal: true,
      host: 'localhost',
      port: 6379,
    }),
  ],
})
export class AppModule {}
```

### 2. Inject and Use RedisService

Once the module is imported, you can inject `RedisService` into any of your services or controllers and start using it.

```typescript
import { Injectable } from '@nestjs/common';
import { RedisService } from './redis/redis.service'; // Adjust path as needed

@Injectable()
export class MyService {
  constructor(private readonly redisService: RedisService) {}

  async getCachedData(key: string) {
    const cached = await this.redisService.get<string>(key);
    if (cached) {
      return cached;
    }
    // ... logic to fetch and set data
  }

  async cacheData(key: string, value: any) {
    // Set with a TTL of 1 hour
    await this.redisService.set(key, value, 3600);
  }
}
```

## API Reference

`RedisService` provides a wide range of methods to interact with Redis. All methods that store complex data types (like objects or arrays) will automatically `JSON.stringify` them, and methods that retrieve them will `JSON.parse` them.

### Generic Commands

- `set<T>(key: string, value: T, ttl?: number): Promise<void>`: Sets a key-value pair, with an optional TTL in seconds.
- `get<T>(key: string): Promise<T | null>`: Retrieves a value by its key.
- `del(key: string): Promise<void>`: Deletes a key.
- `ttl(key: string): Promise<number>`: Returns the remaining time to live of a key that has a timeout.
- `deleteByPattern(pattern: string): Promise<number>`: Deletes all keys matching a given pattern.
- `existsByPattern(pattern: string): Promise<boolean>`: Checks if any key matching the pattern exists.
- `getByPattern<T>(pattern: string): Promise<T[]>`: Gets all values from keys matching a pattern.

### List Commands

- `rPush<T>(key: string, value: T): Promise<void>`: Appends a value to the end of a list.
- `lPush<T>(key: string, value: T): Promise<void>`: Prepends a value to the beginning of a list.
- `lPop<T>(key: string): Promise<T | null>`: Removes and returns the first element of a list.
- `rPop<T>(key: string): Promise<T | null>`: Removes and returns the last element of a list.
- `getRange<T>(key: string, start: number = 0, end: number = -1): Promise<Array<T>>`: Returns a range of elements from a list.

### Pub/Sub Commands

- `subscribe(channel: string, callback: (message: string) => void | Promise<void>)`: Subscribes to a channel and executes a callback on message.
- `publish(channel: string, message: string)`: Publishes a message to a channel.

### Set Commands

- `sAdd(key: string, value: string): Promise<number>`: Adds a member to a set.
- `sIsMember(key: string, value: string): Promise<number>`: Checks if a member exists in a set.
- `sMembers(key: string): Promise<string[]>`: Returns all members of a set.
- `sRem(key: string, ...members: string[]): Promise<number>`: Removes one or more members from a set.
- `sCard(key: string): Promise<number>`: Returns the number of members in a set.

### Hash Commands

- `hSet(key: string, field: string, value: string | number): Promise<number>`: Sets a field in a hash.
- `hGet(key: string, field: string): Promise<string | null>`: Gets the value of a field in a hash.
- `hGetAll(key: string): Promise<Record<string, string>>`: Gets all fields and values in a hash.
- `hIncrBy(key: string, field: string, increment: number = 1): Promise<number>`: Increments the integer value of a hash field by the given number.
- `hDel(key: string, ...fields: string[]): Promise<number>`: Deletes one or more hash fields.

### Sorted Set Commands

- `zAdd(key: string, members: Array<{ score: number; value: string }>): Promise<number>`: Adds one or more members to a sorted set.
- `zRem(key: string, ...members: string[]): Promise<number>`: Removes one or more members from a sorted set.
- `zRevRangeWithScores(key: string, start: number, stop: number): Promise<Array<{ score: number; value: string }>>`: Returns a range of members in a sorted set, by index, with scores, ordered from high to low.

## Configuration

The module configuration is passed directly to `ioredis`. You can use any valid `RedisOptions` from the `ioredis` library.

In addition to the `ioredis` options, the `register` and `registerAsync` methods accept the following extra parameter:

- `isGlobal` (boolean): If `true`, the `RedisService` will be provided globally. Defaults to `false`.

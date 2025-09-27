
[![npm version](https://img.shields.io/npm/v/nestjs-redis-client.svg)](https://www.npmjs.com/package/nestjs-redis-client)
[![npm downloads](https://img.shields.io/npm/dm/nestjs-redis-client.svg)](https://www.npmjs.com/package/nestjs-redis-client)
[![GitHub stars](https://img.shields.io/github/stars/mouloud240/Nestjs-redis.svg?style=social)](https://github.com/YOUR_GITHUB_USERNAME/nestjs-redis)
[![GitHub issues](https://img.shields.io/github/issues/mouloud240/Nestjs-redis.svg)](https://github.com/YOUR_GITHUB_USERNAME/nestjs-redis/issues)
[![License](https://img.shields.io/npm/l/nestjs-redis-client.svg)](LICENSE)

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

## Using the Interceptor

The NestJS Redis Module includes a caching interceptor that automatically caches method responses based on configurable parameters.

To use the interceptor, you need to import the `RedisModule` on the scope of the usage unless the module is set to global.
### Basic Usage

To use the Redis interceptor in a controller or service method, apply the `@UseInterceptors()` decorator:

```typescript
import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { RedisCacheInterceptor } from './redis/redis-cache.interceptor'; // Adjust path as needed

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id')
  @UseInterceptors(RedisCacheInterceptor)
  async getUser(@Param('id') id: string) {
    // This response will be cached automatically
    return this.userService.findById(id);
  }
}
```

### Custom Cache Configuration

You can customize the cache behavior using the `@CacheKey` and `@CacheTTL` decorators:
this is not recommended since we are going to autotune the ttl per endpoint using ai 

```typescript
import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { RedisCacheInterceptor, CacheKey, CacheTTL } from './redis'; // Adjust path as needed

@Controller('products')
export class ProductController {
  @Get(':id')
  @UseInterceptors(RedisCacheInterceptor)
  @CacheKey('product') // Custom cache key prefix
  @CacheTTL(7200) // Cache for 2 hours (in seconds)
  async getProduct(@Param('id') id: string) {
    return this.productService.findById(id);
  }
}

```


### Global Interceptor Usage

To use the Redis interceptor globally across your entire application, you need to provide it using the `APP_INTERCEPTOR` token in your module:

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { RedisModule } from './redis/redis.module';
import { RedisCacheInterceptor } from './redis/redis-cache.interceptor';

@Module({
  imports: [
    RedisModule.register({
      isGlobal: true,
      host: 'localhost',
      port: 6379,
    }),
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: RedisCacheInterceptor,
    },
  ],
})
export class AppModule {}
```

### Conditional Caching

You can conditionally enable/disable caching using the `@NoCache` decorator:

```typescript
import { Controller, Get, Post } from '@nestjs/common';
import { NoCache } from './redis/decorators'; // Adjust path as needed

@Controller('analytics')
export class AnalyticsController {
  @Get('stats')
  // This will be cached (assuming global interceptor is enabled)
  async getStats() {
    return this.analyticsService.calculateStats();
  }

  @Post('track')
  @NoCache() // This will bypass caching
  async trackEvent(@Body() event: any) {
    return this.analyticsService.trackEvent(event);
  }
}
```

### Cache Invalidation
The interceptor works seamlessly with the RedisService for manual cache invalidation:
In here you are supposed to  use the custom key you genereated earlier with the @CacheKey decorator
If you cannot part with eventual consistency issues and you need to invalidate the cache after each update , it would be better to handle it manually and set the route to @NoCache instead
```typescript
@Injectable()
export class UserService {
  constructor(private readonly redisService: RedisService) {}

  async updateUser(id: string, userData: any) {
    const updatedUser = await this.userRepository.update(id, userData);
    
    // Invalidate cached user data
    await this.redisService.del(`user:${id}`);
    
    return updatedUser;
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

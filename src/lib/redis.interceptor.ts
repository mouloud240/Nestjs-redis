import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Observable, of } from "rxjs";
import { tap, catchError } from "rxjs/operators";
import { RedisService } from "./redis.service";
import { Reflector } from "@nestjs/core";
import * as crypto from "crypto";
import { NO_CACHE_KEY } from "./decorators/no-cache.decorator";
import { CACHE_KEY_KEY } from "./decorators/cache-key.decorator";
import { CACHE_TTL_KEY } from "./decorators/cache-ttl.decorator";
import { Request } from "express";
import { CacheTelemetryService } from "./telemetry/cache-telemetry.service";
import { PolicyManagerService } from "./autotuning/policy-manager.service";

/**
 * Internal cache envelope type containing data and metadata
 * Not exported from the module
 */
interface CacheEnvelope<T> {
  data: T;
  meta: {
    storedAt: Date;
  };
}

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly TTL_SECONDS = 600; // 10 minutes (default fallback)
  logger = new Logger(CacheInterceptor.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
    // Optional dependencies for backward compatibility
    // If these aren't provided, interceptor works without auto-tuning
    private readonly telemetryService?: CacheTelemetryService,
    private readonly policyManager?: PolicyManagerService,
  ) {}

  /**
   * Generates a Redis cache key from request parameters
   * @param request The request object
   * @returns A hashed cache key
   * TODO: change request type to match the Adapter
   */
  private generateCacheKey(request: any): string {
    const { method, url, query, params } = request;

    // Create a string representation of all cacheable parameters
    const cacheData = {
      method,
      url,
      query: query || {},
      params: params || {},
    };

    // Sort objects to ensure consistent hashing
    const sortedData = JSON.stringify(cacheData, Object.keys(cacheData).sort());

    // Generate SHA256 hash
    const hash = crypto.createHash("sha256").update(sortedData).digest("hex");

    return `cache:${hash}`;
  }

  /**
   * Extract endpoint pattern for telemetry
   * Converts "/api/products/123" -> "GET /api/products/:id"
   * TODO: change request type to match the Adapter
   */
  private getEndpointPattern(request: Request): string {
    const route = request.route?.path || request.url;
    return `${request.method} ${route}`;
  }

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();

    const isGetRequest = request.method === "GET";
    if (!isGetRequest) {
      // Only cache GET requests
      return next.handle();
    }

    // Check for no-cache conditions
    const noCache = this.reflector.getAllAndOverride<Boolean>(NO_CACHE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const noCacheHeader = request.headers["cache-control"]
      ?.toLowerCase()
      ?.includes("no-cache")
      ? "true"
      : undefined;

    if (noCache || noCacheHeader === "true") {
      response.set("x-cache", "BYPASS");

      //  Record bypass event for telemetry
      if (this.telemetryService) {
        this.telemetryService.recordEvent({
          endpoint: this.getEndpointPattern(request),
          key: "bypass",
          type: "bypass",
          timestamp: new Date(),
        });
      }

      return next.handle();
    }

    // Get cache key (custom or generated)
    const overridenKey = this.reflector.getAllAndOverride<string | undefined>(
      CACHE_KEY_KEY,
      [context.getHandler()],
    );
    const cacheKey = overridenKey || this.generateCacheKey(request);
    const endpoint = this.getEndpointPattern(request);

    try {
      // Get dynamic TTL from auto-tuning policy (if available)
      let ttl = this.TTL_SECONDS;
      let negativeCacheTTL: number | undefined;
      let negativeCacheStatusCodes: number[] | undefined;

      // Check for dynamic policy from LLM auto-tuning
      if (this.policyManager) {
        try {
          const policy = await this.policyManager.getPolicy(endpoint);
          if (policy) {
            ttl = policy.ttl;
            negativeCacheTTL = policy.negativeCacheTTL;
            negativeCacheStatusCodes = policy.negativeCacheStatusCodes;
            this.logger.log(
              `Using auto-tuned policy for ${endpoint}: TTL ${ttl}s`,
            );
          }
        } catch (policyError) {
          this.logger.error("Policy lookup failed, using default TTL");
        }
      }

      const decoratorTTL = this.reflector.getAllAndOverride<number>(
        CACHE_TTL_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (decoratorTTL) {
        ttl = decoratorTTL;
        this.logger.log(`Using decorator TTL for ${endpoint}: ${ttl}s`);
      }

      // Try to get cached response
      const cachedEnvelope =
        await this.redisService.get<CacheEnvelope<any>>(cacheKey);

      if (cachedEnvelope) {
        const { meta, data } = cachedEnvelope;
        const responseTime = Date.now() - startTime;

        // Record cache HIT event
        if (this.telemetryService) {
          this.telemetryService.recordEvent({
            endpoint,
            key: cacheKey,
            type: "hit",
            statusCode: response.statusCode || 200,
            responseTime,
            ttl,
            timestamp: new Date(),
          });
        }

        // Calculate cache age for debugging
        const cacheAge = Math.floor(
          (Date.now() - new Date(meta.storedAt).getTime()) / 1000,
        );

        response.set("x-cache", "HIT");
        response.set("x-cache-age", cacheAge.toString()); // How old is this cache entry
        response.set("x-cache-ttl", ttl.toString()); // Current TTL policy

        return of(data);
      } else {
        // Cache miss - proceed with original handler
        response.set("x-cache", "MISS");
        response.set("x-cache-ttl", ttl.toString());

        return next.handle().pipe(
          tap(async (data) => {
            const responseTime = Date.now() - startTime;
            const statusCode = response.statusCode;

            // Determine if we should cache this response
            let shouldCache = true;
            let cacheTTL = ttl;

            // Check for negative caching (cache errors too)
            if (statusCode >= 400) {
              if (
                negativeCacheTTL &&
                negativeCacheStatusCodes?.includes(statusCode)
              ) {
                // Cache this error with shorter TTL
                cacheTTL = negativeCacheTTL;
                this.logger.log(
                  `Negative caching ${statusCode} for ${endpoint} with TTL ${cacheTTL}s`,
                );
              } else if (statusCode >= 500) {
                // Don't cache server errors by default
                shouldCache = false;
              } else if (statusCode >= 400 && statusCode < 500) {
                // Client errors cache briefly by default
                shouldCache = true;
                cacheTTL = Math.min(cacheTTL, 60);
              }
            }

            // Record cache MISS event
            if (this.telemetryService) {
              this.telemetryService.recordEvent({
                endpoint,
                key: cacheKey,
                type: "miss",
                statusCode,
                responseTime,
                ttl: cacheTTL,
                timestamp: new Date(),
              });
            }

            // Store response in cache
            if (shouldCache) {
              try {
                const envelope: CacheEnvelope<any> = {
                  data,
                  meta: { storedAt: new Date() },
                };

                await this.redisService.set(cacheKey, envelope, cacheTTL);
                this.logger.debug(`Cached ${endpoint} with TTL ${cacheTTL}s`);
              } catch (error) {
                this.logger.error("Failed to cache response:", error);
              }
            }
          }),
          catchError((error) => {
            const responseTime = Date.now() - startTime;

            // Record ERROR event
            if (this.telemetryService) {
              this.telemetryService.recordEvent({
                endpoint,
                key: cacheKey,
                type: "error",
                statusCode: error.status || 500,
                responseTime,
                timestamp: new Date(),
              });
            }

            throw error;
          }),
        );
      }
    } catch (error) {
      this.logger.error("Redis cache error:", error);
      response.set("x-cache", "ERROR");

      // Record ERROR event for Redis failures
      if (this.telemetryService) {
        this.telemetryService.recordEvent({
          endpoint: this.getEndpointPattern(request),
          key: cacheKey,
          type: "error",
          timestamp: new Date(),
        });
      }

      return next.handle();
    }
  }
}

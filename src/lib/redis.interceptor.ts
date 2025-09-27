import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { RedisService } from './redis.service';
import * as crypto from 'crypto';

/**
 * Internal cache envelope type containing data and metadata
 * Not exported from the module
 */
interface CacheEnvelope<T> {
  data: T;
  meta:{
    storedAt: Date;
  }
}

@Injectable()
export class RedisInterceptor implements NestInterceptor {
  private readonly TTL_SECONDS = 600; // 10 minutes

  constructor(
    private readonly redisService: RedisService,
  ) {}

  /**
   * Generates a Redis cache key from request parameters
   * @param request The Express request object
   * @returns A hashed cache key
   */
  private generateCacheKey(request: any): string {
    const { method, url, query, params } = request;
    
    // Create a string representation of all cacheable parameters
    const cacheData = {
      method,
      url,
      query: query || {},
      params: params || {}
    };
    
    // Sort objects to ensure consistent hashing
    const sortedData = JSON.stringify(cacheData, Object.keys(cacheData).sort());
    
    // Generate SHA256 hash
    const hash = crypto.createHash('sha256').update(sortedData).digest('hex');
    
    return `cache:${hash}`;
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    
    const cacheKey = this.generateCacheKey(request);

    try {
      // Try to get cached response
      const cachedEnvelope = await this.redisService.get<CacheEnvelope<any>>(cacheKey);
    
      
      if (cachedEnvelope) {
        const {meta,data}=cachedEnvelope
        // Cache hit - return cached response with x-cache header
        response.set('x-cache', 'HIT');
        return of(data);
      } else {
        // Cache miss - proceed with original handler
        response.set('x-cache', 'MISS');
        
        return next.handle().pipe(
          tap(async (data) => {
            // Store response in cache with TTL
            const envelope: CacheEnvelope<any> = {
              data,
              meta: { storedAt: new Date() }
            };
            
            try {
              await this.redisService.set(cacheKey, envelope, this.TTL_SECONDS);
            } catch (error) {
              console.error('Failed to cache response:', error);
            }
          })
        );
      }
    } catch (error) {
      // Redis error - fallback to original handler
      console.error('Redis cache error:', error);
      response.set('x-cache', 'ERROR');
      
      return next.handle();
    }
  }
}

import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { RedisService } from './redis.service';
import { Reflector } from '@nestjs/core';
import * as crypto from 'crypto';
import { NO_CACHE_KEY } from './decorators/no-cache.decorator';
import { CACHE_KEY_KEY } from './decorators/cache-key.decorator';
import { CACHE_TTL_KEY } from './decorators/cache-ttl.decorator';

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
export class CacheInterceptor implements NestInterceptor {
  private readonly TTL_SECONDS = 600; // 10 minutes
  logger=new Logger(CacheInterceptor.name)

  constructor(
    private readonly redisService: RedisService,
    private readonly reflector:Reflector
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
    
    const isGetRequest = request.method === 'GET';
    if (!isGetRequest) {
      // Only cache GET requests
      return next.handle();
    }
    const noCache=this.reflector.getAllAndOverride<Boolean>(NO_CACHE_KEY,[
      context.getHandler(),
      context.getClass()
    ])
    const noCacheHeader=request.headers['x-no-cache']
    if(noCache || noCacheHeader==='true'){
      response.set('x-cache', 'BYPASS');
      return next.handle();
    }

    const overridenKey=this.reflector.getAllAndOverride<string|undefined>(CACHE_KEY_KEY,[
      context.getHandler(),
    ])
    const cacheKey =overridenKey ? overridenKey: this.generateCacheKey(request);

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
              const TTL=this.reflector.getAllAndOverride<number>(CACHE_TTL_KEY,[
                context.getHandler(),
                context.getClass()
              ]) ?? this.TTL_SECONDS;
              
              await this.redisService.set(cacheKey, envelope, TTL);
            } catch (error) {
              this.logger.error('Failed to cache response:', error);
            }
          })
        );
      }
    } catch (error) {
      // Redis error - fallback to original handler
      this.logger.error('Redis cache error:', error);
      response.set('x-cache', 'ERROR');
      
      return next.handle();
    }
  }
}

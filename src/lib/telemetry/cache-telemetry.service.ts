import { RedisService } from "../redis.service"; 
import { Injectable, Logger } from "@nestjs/common";
import { EndpointMetrics,CacheEvent,TelemetryDigest } from "../autotuning/types";

@Injectable()
export class CacheTelemetryService {
  constructor(private readonly redisService:RedisService) {}

  private readonly logger = new Logger(CacheTelemetryService.name);
  private currentMetrics = new Map<string,EndpointMetrics>();
  private windowStartTime = new Date();

  /*
   *Record a cache event (hit, miss, error, bypass) for a specific endpoint
   * */
  public recordEvent(event:CacheEvent) {
  const { endpoint,key,type,statusCode,responseTime,ttl } = event;
  
 let metrics = this.currentMetrics.get(endpoint);
    if (!metrics) {
      metrics = {
        endpoint,
        totalRequests: 0,
        hits: 0,
        misses: 0,
        errors: 0,
        bypasses: 0,
        currentTTL: ttl || 600,
        uniqueKeys: new Set(),
        statusCodes: {},
        responseTimes: [],
        keyPattern: this.extractKeyPattern(key),
      };
      this.currentMetrics.set(endpoint, metrics);
    }
    metrics.totalRequests++;
    metrics.uniqueKeys.add(key);

    if (responseTime) {
      metrics.responseTimes.push(responseTime);
    }

    if (statusCode) {
      metrics.statusCodes[statusCode] = (metrics.statusCodes[statusCode] || 0) + 1;
    }
    switch (type) {
      case "hit":
        metrics.hits++;
        break;
      case "miss":
        metrics.misses++;
        if (ttl) {
          metrics.currentTTL = ttl;
        }
        break;
      case "error":
        metrics.errors++;
        break;
      case "bypass":
        metrics.bypasses++;
        break;
    } 
  }

/**
   * Generate a compressed digest of the current window
   */
  public generateDigest(): TelemetryDigest {
    const windowEnd = new Date();
    const endpoints = Array.from(this.currentMetrics.values()).map(m => {
      const total = m.totalRequests || 1;
      const avgResponseTime = m.responseTimes.length > 0
        ? m.responseTimes.reduce((a, b) => a + b, 0) / m.responseTimes.length
        : 0;

      const topErrors = Object.entries(m.statusCodes)
        .filter(([code]) => parseInt(code) >= 400)
        .map(([code, count]) => ({ code: parseInt(code), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        endpoint: m.endpoint,
        requests: m.totalRequests,
        hitRate: (m.hits / total) * 100,
        missRate: (m.misses / total) * 100,
        errorRate: (m.errors / total) * 100,
        currentTTL: m.currentTTL,
        avgResponseTime,
        hitResponseTime: avgResponseTime * 0.7, // Approximation
        missResponseTime: avgResponseTime * 1.5, // Approximation
        uniqueKeys: m.uniqueKeys.size,
        keyEntropy: m.uniqueKeys.size / total,
        statusCodes: m.statusCodes,
        topErrors,
      };
    });

    const totalRequests = endpoints.reduce((sum, e) => sum + e.requests, 0);
    const avgHitRate = totalRequests > 0
      ? endpoints.reduce((sum, e) => sum + (e.hitRate * e.requests), 0) / totalRequests
      : 0;
    const avgErrorRate = totalRequests > 0
      ? endpoints.reduce((sum, e) => sum + (e.errorRate * e.requests), 0) / totalRequests
      : 0;

    return {
      windowStart: this.windowStartTime,
      windowEnd,
      endpoints,
      globalStats: {
        totalRequests,
        avgHitRate,
        avgErrorRate,
      },
    };
  }
  

/**
   * Reset metrics for new window
   */
  resetWindow(): void {
    this.currentMetrics.clear();
    this.windowStartTime = new Date();
  }

  /**
   * Extract a pattern from a cache key
   */
  private extractKeyPattern(key: string): string {
    return key.replace(/[a-f0-9]{32,}/g, '*').replace(/:\d+/g, ':*');
  }

   /**
   * Store digest in Redis for historical analysis
   */
  async storeDigest(digest: TelemetryDigest): Promise<void> {
    const key = `telemetry:digest:${digest.windowStart.getTime()}`;
    await this.redisService.set(key, digest, 86400 * 7); // Keep for 7 days
  }
}
}

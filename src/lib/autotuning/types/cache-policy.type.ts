export type CachePolicy = {
  endpoint: string;
  ttl: number;
  negativeCacheTTL?: number;
  negativeCacheStatusCodes?: number[];
  appliedAt: Date;
  appliedBy: string;
  previousTTL?: number;
  confidence: number;
  reason: string;
};

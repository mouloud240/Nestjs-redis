export const CACHE_TTL_KEY = '__cache_ttl__';
export const CacheTTL = (ttl: number) =>
  Reflect.metadata(CACHE_TTL_KEY, ttl);

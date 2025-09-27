import { SetMetadata } from "@nestjs/common";

export const CACHE_TTL_KEY = '__cache_ttl__';

export const CacheTTL = (ttl: number) =>
 SetMetadata(CACHE_TTL_KEY, ttl);

import { SetMetadata } from "@nestjs/common";

export const CACHE_KEY_KEY='__cache_key__';
export const CacheKey=(key:string)=>
  SetMetadata(CACHE_KEY_KEY,key);

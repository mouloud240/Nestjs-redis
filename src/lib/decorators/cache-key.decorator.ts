export const CACHE_KEY_KEY='__cache_key__';
export const CacheKey=(key:string)=>
  Reflect.metadata(CACHE_KEY_KEY,key);

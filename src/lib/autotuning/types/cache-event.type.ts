export type CacheEvent = {
  endpoint: string;
  key: string;
  type: "hit" | "miss" | "error" | "bypass";
  statusCode?: number;
  responseTime?: number;
  ttl?: number;
  timestamp: Date;
};

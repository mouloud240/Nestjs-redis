export type PolicyRecommendation = {
  endpoint: string;
  changeType:
    | "increase_ttl"
    | "decrease_ttl"
    | "add_negative_cache"
    | "remove_negative_cache"
    | "no_change";
  oldTTL: number;
  newTTL: number;
  negativeCacheTTL?: number;
  negativeCacheStatusCodes?: number[];
  reason: string;
  confidence: number;
  expectedImpact: string;
};

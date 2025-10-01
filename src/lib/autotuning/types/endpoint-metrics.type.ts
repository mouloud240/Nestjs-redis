export type EndpointMetrics = {
  endpoint: string;
  totalRequests: number;
  hits: number;
  misses: number;
  errors: number;
  bypasses: number;
  currentTTL: number;
  uniqueKeys: Set<string>;
  statusCodes: Record<number, number>;
  responseTimes: number[];
  keyPattern: string;
};

export type TelemetryDigest = {
  windowStart: Date;
  windowEnd: Date;
  endpoints: {
    endpoint: string;
    requests: number;
    hitRate: number;
    missRate: number;
    errorRate: number;
    currentTTL: number;
    avgResponseTime: number;
    hitResponseTime: number;
    missResponseTime: number;
    uniqueKeys: number;
    keyEntropy: number; // uniqueKeys / totalRequests
    statusCodes: Record<number, number>;
    topErrors: Array<{ code: number; count: number }>;
  }[];
  globalStats: {
    totalRequests: number;
    avgHitRate: number;
    avgErrorRate: number;
    memoryUsageMB?: number;
  };
};

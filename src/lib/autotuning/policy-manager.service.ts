import { Injectable } from "@nestjs/common";
import { Logger } from "@nestjs/common";
import { RedisService } from "../redis.service";
import { CachePolicy } from "./types";

@Injectable()
export class PolicyManagerService {
  private readonly logger = new Logger(PolicyManagerService.name);
  private readonly POLICY_PREFIX = "cache:policy:";
  private readonly CHANGE_HISTORY_PREFIX = "cache:policy:history:";

  constructor(private readonly redisService: RedisService) {}

  /*
   * get current policy for an endpoint
   */
  async getPolicy(endpoint: string): Promise<CachePolicy | null> {
    return this.redisService.get<CachePolicy>(
      `${this.POLICY_PREFIX}${endpoint}`,
    );
  }

  /**
   * Set policy for an endpoint
   */
  async setPolicy(policy: CachePolicy): Promise<void> {
    const key = `${this.POLICY_PREFIX}${policy.endpoint}`;
    await this.redisService.set(key, policy, 0);
    await this.addToHistory(policy);
    this.logger.log(
      `Applied policy for ${policy.endpoint}: TTL ${policy.ttl}s (confidence: ${policy.confidence}%)`,
    );
  }

  /**
   * Add policy change to history
   */
  private async addToHistory(policy: CachePolicy): Promise<void> {
    const key = `${this.CHANGE_HISTORY_PREFIX}${policy.endpoint}`;
    await this.redisService.rPush(key, policy);
  }

  /**
   * Get change history for an endpoint
   */
  async getHistory(endpoint: string, limit = 10): Promise<CachePolicy[]> {
    const key = `${this.CHANGE_HISTORY_PREFIX}${endpoint}`;
    const history = await this.redisService.getRange<CachePolicy>(
      key,
      0,
      limit - 1,
    );
    return history;
  }
  /**
   * Check if endpoint can be changed (rate limiting)
   */
  async canChangeEndpoint(
    endpoint: string,
    cooldownMinutes = 60,
  ): Promise<boolean> {
    const policy = await this.getPolicy(endpoint);
    if (!policy) return true;

    const minutesSinceChange =
      (Date.now() - new Date(policy.appliedAt).getTime()) / 1000 / 60;
    return minutesSinceChange >= cooldownMinutes;
  }

  /**
   * Rollback to previous policy
   */
  async rollback(endpoint: string): Promise<void> {
    const history = await this.getHistory(endpoint, 2);
    if (history.length < 2) {
      throw new Error(`No previous policy found for ${endpoint}`);
    }

    const previousPolicy = history[1];
    await this.setPolicy({
      ...previousPolicy,
      appliedAt: new Date(),
      appliedBy: "rollback-system",
      reason: "Automatic rollback due to performance degradation",
    });

    this.logger.warn(
      `Rolled back policy for ${endpoint} to TTL ${previousPolicy.ttl}s`,
    );
  }
}

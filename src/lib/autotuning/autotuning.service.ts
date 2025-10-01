import { Injectable, Logger } from "@nestjs/common";
import { CacheTelemetryService } from "../telemetry/cache-telemetry.service";
import { LLMService } from "./llm.service";
import { PolicyManagerService } from "./policy-manager.service";
import { PolicyRecommendation } from "./types";

@Injectable()
export class AutotuningService {
  private readonly logger = new Logger(AutotuningService.name);
  private readonly WINDOW_DURATION_MS = 15 * 60 * 1000; // 15 minutes
  private intervalHandle: NodeJS.Timeout | null = null;

  constructor(
    private readonly telemetry: CacheTelemetryService,
    private readonly llm: LLMService,
    private readonly policyManager: PolicyManagerService,
  ) {}

/**
   * Start the autotuning loop
   */
  start(): void {
    if (this.intervalHandle) {
      this.logger.warn('Autotuning already started');
      return;
    }

    this.logger.log(`Starting autotuning with ${this.WINDOW_DURATION_MS / 1000 / 60}min windows`);
    
    this.intervalHandle = setInterval(() => {
      this.runAutotuningCycle().catch(err => {
        this.logger.error('Autotuning cycle failed:', err);
      });
    }, this.WINDOW_DURATION_MS);
  }

  /**
   * Stop the autotuning loop
   */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.logger.log('Autotuning stopped');
    }
  }


 /**
   * Run a complete autotuning cycle
   */
  private async runAutotuningCycle(): Promise<void> {
    this.logger.log('Starting autotuning cycle');

    // 1. Generate digest
    const digest = this.telemetry.generateDigest();
    await this.telemetry.storeDigest(digest);
    
    if (digest.globalStats.totalRequests < 100) {
      this.logger.log('Not enough traffic for meaningful analysis, skipping cycle');
      this.telemetry.resetWindow();
      return;
    }

    // 2. Get LLM recommendations
    const llmResponse = await this.llm.getRecommendations(digest);
    
    // 3. Validate and apply recommendations
    const applied: string[] = [];
    const rejected: string[] = [];

    for (const rec of llmResponse.recommendations) {
      const isValid = await this.validateRecommendation(rec);
      
      if (isValid) {
        await this.applyRecommendation(rec);
        applied.push(rec.endpoint);
      } else {
        rejected.push(rec.endpoint);
      }
    }

    this.logger.log(`Autotuning cycle complete: ${applied.length} applied, ${rejected.length} rejected`);
    
    // 4. Reset window for next cycle
    this.telemetry.resetWindow();
  }

   private async validateRecommendation(rec: PolicyRecommendation): Promise<boolean> {
    // Check confidence threshold
    if (rec.confidence < 70) {
      this.logger.debug(`Rejecting ${rec.endpoint}: confidence too low (${rec.confidence}%)`);
      return false;
    }

    // Check TTL bounds
    if (rec.newTTL < 60 || rec.newTTL > 7200) {
      this.logger.debug(`Rejecting ${rec.endpoint}: TTL out of bounds (${rec.newTTL}s)`);
      return false;
    }

    // Check rate limiting
    const canChange = await this.policyManager.canChangeEndpoint(rec.endpoint, 60);
    if (!canChange) {
      this.logger.debug(`Rejecting ${rec.endpoint}: changed too recently (rate limited)`);
      return false;
    }

    // Check if change is meaningful (at least 20% difference)
    const percentChange = Math.abs(rec.newTTL - rec.oldTTL) / rec.oldTTL;
    if (percentChange < 0.2) {
      this.logger.debug(`Rejecting ${rec.endpoint}: change too small (${(percentChange * 100).toFixed(0)}%)`);
      return false;
    }

    return true;
  }

  /**
   * Apply a validated recommendation
  */
  private async applyRecommendation(rec: PolicyRecommendation): Promise<void> {
    const policy: CachePolicy = {
      endpoint: rec.endpoint,
      ttl: rec.newTTL,
      negativeCacheTTL: rec.negativeCacheTTL,
      negativeCacheStatusCodes: rec.negativeCacheStatusCodes,
      appliedAt: new Date(),
      appliedBy: 'llm-autotuner',
      previousTTL: rec.oldTTL,
      confidence: rec.confidence,
      reason: rec.reason,
    };

    await this.policyManager.setPolicy(policy);
  }
}

}

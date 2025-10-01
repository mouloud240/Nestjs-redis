import { Injectable, Logger } from "@nestjs/common";
import { TelemetryDigest, PolicyRecommendation, LLMResponse } from "./types";

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly apiEndpoint =
    "https://generativelanguage.googleapis.com/v1beta/models";

  constructor() {
    this.apiKey =
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
    this.model = process.env.GEMINI_MODEL || "gemini-1.5-flash";

    if (!this.apiKey) {
      this.logger.warn("GEMINI_API_KEY not set. Auto-tuning will not work.");
    }
  }

  /**
   * Get recommendations from Gemini based on telemetry digest
   * NOTE: use HttpModule instead of fetch
   */
  async getRecommendations(digest: TelemetryDigest): Promise<LLMResponse> {
    const prompt = this.buildPrompt(digest);

    try {
      const url = `${this.apiEndpoint}/${this.model}:generateContent?key=${this.apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: this.getSystemPrompt() + "\n\n" + prompt,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.3, // Lower for more consistent recommendations
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
            responseMimeType: "application/json", // Request JSON response
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gemini API error: ${JSON.stringify(errorData)}`);
      }

      const data = await response.json();

      // Extract text from Gemini response structure
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        throw new Error("No content in Gemini response");
      }

      // Parse JSON response
      let parsed: LLMResponse;
      try {
        // Gemini might wrap JSON in markdown code blocks
        const jsonMatch =
          content.match(/```json\n?([\s\S]*?)\n?```/) ||
          content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]) as LLMResponse;
        } else {
          parsed = JSON.parse(content) as LLMResponse;
        }
      } catch (parseError) {
        this.logger.error("Failed to parse Gemini response:", content);
        throw new Error(
          `Invalid JSON response from Gemini: ${parseError.message}`,
        );
      }

      this.logger.log(
        `Gemini analysis complete. ${parsed.recommendations.length} recommendations ` +
          `with ${parsed.overallConfidence}% confidence`,
      );

      return parsed;
    } catch (error) {
      this.logger.error("Gemini API error:", error);
      throw error;
    }
  }

  /**
   * Build the system prompt for Gemini
   */
  private getSystemPrompt(): string {
    return `You are an expert Redis cache optimization system for a NestJS application.

Your job is to analyze cache telemetry and recommend specific TTL and caching policy changes.

## Rules:
1. Only recommend changes with high confidence (>70%)
2. Consider the trade-off between cache hits and memory usage
3. High hit rates (>85%) with low error rates (<2%) suggest stable data → increase TTL
4. High miss rates (>40%) suggest either short TTL or high key variety
5. Error rates >5% suggest unstable data → decrease TTL or add retry logic
6. High key entropy (>0.7) means many unique keys → be cautious with long TTLs (memory)
7. For 404 errors that repeat, suggest negative caching with short TTL (60-300s)
8. Never recommend TTL < 60s or > 7200s (2 hours)
9. If hit rate is already excellent (>95%), don't change unless there's a clear problem
10. Consider response time differences: if cache misses are much slower, increasing TTL helps more

## Response Format:
Respond ONLY with valid JSON (no markdown, no code blocks) in this exact format:

{
  "recommendations": [
    {
      "endpoint": "GET /api/products/:id",
      "changeType": "increase_ttl",
      "oldTTL": 600,
      "newTTL": 1800,
      "reason": "High hit rate (92%) with low error rate (0.5%) suggests stable data. Cache misses take 320ms vs 45ms for hits.",
      "confidence": 88,
      "expectedImpact": "Reduce backend load by ~67%, increase hit rate to ~95%"
    }
  ],
  "warnings": ["Example: Endpoint X has high memory usage and key entropy of 0.85"],
  "overallConfidence": 85,
  "analysis": "Brief summary of overall findings across all endpoints"
}

## Important Notes:
- Be conservative with changes to critical endpoints
- Explain your reasoning clearly
- Consider the business impact (e.g., stale data tolerance)
- If uncertain, suggest smaller TTL changes or flag for manual review`;
  }

  /**
   * Build the user prompt with telemetry data
   */
  private buildPrompt(digest: TelemetryDigest): string {
    const duration =
      (digest.windowEnd.getTime() - digest.windowStart.getTime()) / 1000 / 60;

    let prompt = `# Cache Telemetry Analysis Request\n\n`;
    prompt += `Analyze this ${duration.toFixed(0)}-minute cache telemetry window and recommend policy changes.\n\n`;

    prompt += `## Global Statistics\n`;
    prompt += `- Total Requests: ${digest.globalStats.totalRequests.toLocaleString()}\n`;
    prompt += `- Average Hit Rate: ${digest.globalStats.avgHitRate.toFixed(1)}%\n`;
    prompt += `- Average Error Rate: ${digest.globalStats.avgErrorRate.toFixed(1)}%\n`;

    if (digest.globalStats.memoryUsageMB) {
      prompt += `- Redis Memory Usage: ${digest.globalStats.memoryUsageMB.toFixed(0)}MB\n`;
    }
    prompt += `\n`;

    prompt += `## Endpoint-by-Endpoint Analysis\n\n`;

    digest.endpoints.forEach((endpoint, index) => {
      prompt += `### ${index + 1}. ${endpoint.endpoint}\n\n`;

      // Request metrics
      prompt += `**Request Metrics:**\n`;
      prompt += `- Total Requests: ${endpoint.requests.toLocaleString()}\n`;
      prompt += `- Unique Keys: ${endpoint.uniqueKeys.toLocaleString()} (entropy: ${endpoint.keyEntropy.toFixed(2)})\n`;
      prompt += `\n`;

      // Cache performance
      prompt += `**Cache Performance:**\n`;
      prompt += `- Hit Rate: ${endpoint.hitRate.toFixed(1)}%\n`;
      prompt += `- Miss Rate: ${endpoint.missRate.toFixed(1)}%\n`;
      prompt += `- Error Rate: ${endpoint.errorRate.toFixed(1)}%\n`;
      prompt += `- Current TTL: ${endpoint.currentTTL}s (${(endpoint.currentTTL / 60).toFixed(1)} minutes)\n`;
      prompt += `\n`;

      // Response times
      prompt += `**Response Times:**\n`;
      prompt += `- Average: ${endpoint.avgResponseTime.toFixed(0)}ms\n`;
      prompt += `- Cache Hit: ${endpoint.hitResponseTime.toFixed(0)}ms\n`;
      prompt += `- Cache Miss: ${endpoint.missResponseTime.toFixed(0)}ms\n`;
      prompt += `- Miss Penalty: ${(endpoint.missResponseTime - endpoint.hitResponseTime).toFixed(0)}ms slower\n`;
      prompt += `\n`;

      // Error analysis
      if (endpoint.topErrors.length > 0) {
        prompt += `**Error Breakdown:**\n`;
        endpoint.topErrors.forEach((error) => {
          const percentage = ((error.count / endpoint.requests) * 100).toFixed(
            1,
          );
          prompt += `- HTTP ${error.code}: ${error.count} occurrences (${percentage}%)\n`;
        });
        prompt += `\n`;
      }

      // Key insights
      prompt += `**Key Insights:**\n`;
      if (endpoint.keyEntropy > 0.7) {
        prompt += `- ⚠️ High key entropy (${endpoint.keyEntropy.toFixed(2)}) - many unique keys, memory concern\n`;
      }
      if (endpoint.hitRate > 90) {
        prompt += `- ✅ Excellent hit rate - data is stable\n`;
      }
      if (endpoint.errorRate > 5) {
        prompt += `- ⚠️ High error rate - data may be unstable\n`;
      }
      if (endpoint.missResponseTime > endpoint.hitResponseTime * 3) {
        prompt += `- ⚠️ Cache misses are ${(endpoint.missResponseTime / endpoint.hitResponseTime).toFixed(1)}x slower - high value from caching\n`;
      }
      prompt += `\n`;

      prompt += `---\n\n`;
    });

    prompt += `## Your Task\n\n`;
    prompt += `Based on this telemetry data:\n`;
    prompt += `1. Identify endpoints that would benefit from TTL adjustments\n`;
    prompt += `2. Recommend specific TTL changes with reasoning\n`;
    prompt += `3. Suggest negative caching for repeated error codes\n`;
    prompt += `4. Flag any concerning patterns or risks\n`;
    prompt += `5. Provide your overall confidence in these recommendations\n\n`;
    prompt += `Remember: Be conservative and explain your reasoning. Return valid JSON only.`;

    return prompt;
  }

  /**
   * Validate Gemini API key
   */
  async validateApiKey(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      const url = `${this.apiEndpoint}/${this.model}:generateContent?key=${this.apiKey}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Hello",
                },
              ],
            },
          ],
        }),
      });

      return response.ok;
    } catch (error) {
      this.logger.error("Failed to validate Gemini API key:", error);
      return false;
    }
  }

  /**
   * Get available models
   */
  async listModels(): Promise<string[]> {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`;

      const response = await fetch(url);
      const data = await response.json();

      return (
        data.models
          ?.filter((m: any) => m.name.includes("gemini"))
          ?.map((m: any) => m.name.split("/").pop()) || []
      );
    } catch (error) {
      this.logger.error("Failed to list Gemini models:", error);
      return [];
    }
  }
}

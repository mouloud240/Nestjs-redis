import { PolicyRecommendation } from "./policy-recommendation.type";

export type LLMResponse = {
  recommendations: PolicyRecommendation[];
  warnings: string[];
  overallConfidence: number;
  analysis: string;
};

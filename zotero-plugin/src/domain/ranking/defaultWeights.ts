import type { RankingWeights } from "./features.ts";

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  recentSimilarity: 0.35,
  longTermSimilarity: 0.25,
  representativeSimilarity: 0.2,
  keywordMatch: 0.1,
  manualPriority: 0.1,
  negativeSimilarity: -0.25,
};

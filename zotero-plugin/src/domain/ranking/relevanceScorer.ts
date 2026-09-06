import type { ArxivCandidate, ScoreBreakdown } from "../model.ts";
import { DEFAULT_RANKING_WEIGHTS } from "./defaultWeights.ts";
import {
  extractCandidateFeatures,
  type FeatureContext,
  type RankingCandidate,
  type RankingWeights,
} from "./features.ts";

export interface ScoredCandidate {
  readonly candidate: ArxivCandidate;
  readonly features: ReturnType<typeof extractCandidateFeatures>;
  readonly score: ScoreBreakdown;
  readonly matchedProfileID?: string;
  readonly matchedProfileName?: string;
}

export function scoreCandidate(
  input: RankingCandidate,
  context: FeatureContext,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): ScoredCandidate {
  const features = extractCandidateFeatures(input, context);
  const rawScore =
    features.recentSimilarity * weights.recentSimilarity +
    features.longTermSimilarity * weights.longTermSimilarity +
    features.representativeSimilarity * weights.representativeSimilarity +
    features.keywordMatch * weights.keywordMatch +
    features.manualPriority * weights.manualPriority +
    features.negativeSimilarity * weights.negativeSimilarity;
  const match =
    features.recentMatch &&
    features.recentMatch.similarity >=
      (features.longTermMatch?.similarity ?? -1)
      ? features.recentMatch
      : features.longTermMatch;
  return {
    candidate: input.candidate,
    features,
    score: {
      recentSimilarity: features.recentSimilarity,
      longTermSimilarity: features.longTermSimilarity,
      representativeSimilarity: features.representativeSimilarity,
      keywordMatch: features.keywordMatch,
      manualPriority: features.manualPriority,
      negativeSimilarity: features.negativeSimilarity,
      rawScore,
      diversityAdjustment: 0,
      rerankedScore: rawScore,
      displayScore: 0,
    },
    matchedProfileID: match?.profile?.id,
    matchedProfileName: match?.profile?.name,
  };
}

export function scoreCandidates(
  inputs: readonly RankingCandidate[],
  context: FeatureContext,
  weights: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): ScoredCandidate[] {
  return inputs
    .map((input) => scoreCandidate(input, context, weights))
    .sort(
      (left, right) =>
        right.score.rawScore - left.score.rawScore ||
        Date.parse(right.candidate.submittedAt) -
          Date.parse(left.candidate.submittedAt) ||
        left.candidate.arxivId.localeCompare(right.candidate.arxivId),
    );
}

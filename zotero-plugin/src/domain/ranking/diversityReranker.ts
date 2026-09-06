import type { ScoreBreakdown } from "../model.ts";
import type { ScoredCandidate } from "./relevanceScorer.ts";
import { cosineSimilarity } from "../profiles/vectorMath.ts";

export interface RerankCandidate extends ScoredCandidate {
  readonly vector: readonly number[];
}

export interface RerankedCandidate extends RerankCandidate {
  readonly quotaAdjustment: number;
  readonly score: ScoreBreakdown;
}

export interface DiversityRerankOptions {
  readonly limit?: number;
  readonly maxSelectedSimilarity?: number;
  readonly singleProfileShare?: number;
}

export function diversityRerank(
  candidates: readonly RerankCandidate[],
  options: DiversityRerankOptions = {},
): RerankedCandidate[] {
  const limit = Math.min(
    candidates.length,
    Math.max(1, options.limit ?? candidates.length),
  );
  const mmrPenalty = options.maxSelectedSimilarity ?? 0.12;
  const quota = options.singleProfileShare ?? 0.6;
  const remaining = [...candidates];
  const selected: RerankedCandidate[] = [];
  const profileCounts = new Map<string, number>();
  while (remaining.length && selected.length < limit) {
    const unrestricted = [...remaining].sort(compareByRaw)[0];
    let bestIndex = 0;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const profileID = candidate.matchedProfileID ?? "unknown";
      const count = profileCounts.get(profileID) ?? 0;
      const atQuota = limit >= 5 && count >= Math.ceil(limit * quota);
      const canBreakQuota =
        atQuota && allowsQuotaBreakthrough(remaining, unrestricted);
      if (atQuota && !canBreakQuota) continue;
      const maxSimilarity = selected.reduce(
        (maximum, previous) =>
          Math.max(
            maximum,
            positiveSimilarity(candidate.vector, previous.vector),
          ),
        0,
      );
      const diversityAdjustment = -mmrPenalty * maxSimilarity;
      const rerankedScore = candidate.score.rawScore + diversityAdjustment;
      if (
        rerankedScore > bestScore ||
        (rerankedScore === bestScore &&
          compareByRaw(candidate, remaining[bestIndex]) < 0)
      ) {
        bestIndex = index;
        bestScore = rerankedScore;
      }
    }
    if (bestScore === Number.NEGATIVE_INFINITY) {
      const fallback = remaining.findIndex(
        (candidate) => candidate === unrestricted,
      );
      bestIndex = fallback >= 0 ? fallback : 0;
    }
    const candidate = remaining.splice(bestIndex, 1)[0];
    const maxSimilarity = selected.reduce(
      (maximum, previous) =>
        Math.max(
          maximum,
          positiveSimilarity(candidate.vector, previous.vector),
        ),
      0,
    );
    const diversityAdjustment = -mmrPenalty * maxSimilarity;
    const rerankedScore = candidate.score.rawScore + diversityAdjustment;
    selected.push({
      ...candidate,
      quotaAdjustment:
        (profileCounts.get(candidate.matchedProfileID ?? "unknown") ?? 0) >=
        Math.ceil(limit * quota)
          ? 1
          : 0,
      score: {
        ...candidate.score,
        diversityAdjustment,
        rerankedScore,
        displayScore: 0,
      },
    });
    const profileID = candidate.matchedProfileID ?? "unknown";
    profileCounts.set(profileID, (profileCounts.get(profileID) ?? 0) + 1);
  }
  return withDisplayScores(selected);
}

function allowsQuotaBreakthrough(
  candidates: readonly RerankCandidate[],
  unrestricted: RerankCandidate,
): boolean {
  const bestOther = candidates
    .filter((item) => item.matchedProfileID !== unrestricted.matchedProfileID)
    .reduce(
      (best, item) => Math.max(best, item.score.rawScore),
      Number.NEGATIVE_INFINITY,
    );
  return bestOther < unrestricted.score.rawScore * 0.85;
}

function withDisplayScores(
  candidates: readonly RerankedCandidate[],
): RerankedCandidate[] {
  const scores = candidates
    .map((candidate) => candidate.score.rerankedScore)
    .sort((a, b) => a - b);
  if (scores.length <= 1 || scores[0] === scores[scores.length - 1]) {
    return candidates.map((candidate) => ({
      ...candidate,
      score: { ...candidate.score, displayScore: 50 },
    }));
  }
  const low = percentile(scores, 0.05);
  const high = percentile(scores, 0.95);
  return candidates.map((candidate) => ({
    ...candidate,
    score: {
      ...candidate.score,
      displayScore: Math.round(
        100 * clamp((candidate.score.rerankedScore - low) / (high - low), 0, 1),
      ),
    },
  }));
}

function compareByRaw(left: RerankCandidate, right: RerankCandidate): number {
  return (
    right.score.rawScore - left.score.rawScore ||
    Date.parse(right.candidate.submittedAt) -
      Date.parse(left.candidate.submittedAt) ||
    left.candidate.arxivId.localeCompare(right.candidate.arxivId)
  );
}

function positiveSimilarity(
  left: readonly number[],
  right: readonly number[],
): number {
  return Math.max(0, Math.min(1, cosineSimilarity(left, right)));
}

function percentile(
  values: readonly number[],
  percentileValue: number,
): number {
  const index = (values.length - 1) * percentileValue;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return values[lower];
  return values[lower] + (values[upper] - values[lower]) * (index - lower);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

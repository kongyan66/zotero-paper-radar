import { cosineSimilarity } from "../domain/profiles/vectorMath.ts";
import type { ReplayPaper } from "./types.ts";

export interface ReplayMetrics {
  readonly precisionAt5: number;
  readonly precisionAt10: number;
  readonly recallAt5: number;
  readonly recallAt10: number;
  readonly mrr: number;
  readonly ndcgAt5: number;
  readonly ndcgAt10: number;
  readonly profileCoverage: number;
  readonly intraListSimilarity: number;
  readonly singleProfileShare: number;
}

export function precisionAtK(
  rankedIDs: readonly string[],
  relevantIDs: ReadonlySet<string>,
  k: number,
): number {
  const top = rankedIDs.slice(0, k);
  return top.length
    ? top.filter((paperID) => relevantIDs.has(paperID)).length / top.length
    : 0;
}

export function recallAtK(
  rankedIDs: readonly string[],
  relevantIDs: ReadonlySet<string>,
  k: number,
): number {
  if (!relevantIDs.size) return 0;
  return (
    rankedIDs.slice(0, k).filter((paperID) => relevantIDs.has(paperID)).length /
    relevantIDs.size
  );
}

export function meanReciprocalRank(
  rankedIDs: readonly string[],
  relevantIDs: ReadonlySet<string>,
): number {
  const rank = rankedIDs.findIndex((paperID) => relevantIDs.has(paperID));
  return rank < 0 ? 0 : 1 / (rank + 1);
}

export function ndcgAtK(
  rankedIDs: readonly string[],
  relevantIDs: ReadonlySet<string>,
  k: number,
): number {
  const dcg = rankedIDs
    .slice(0, k)
    .reduce(
      (sum, paperID, index) =>
        sum + (relevantIDs.has(paperID) ? 1 / Math.log2(index + 2) : 0),
      0,
    );
  const idealLength = Math.min(k, relevantIDs.size);
  const ideal = Array.from(
    { length: idealLength },
    (_, index) => 1 / Math.log2(index + 2),
  ).reduce((sum, value) => sum + value, 0);
  return ideal ? dcg / ideal : 0;
}

export function calculateReplayMetrics(
  rankedIDs: readonly string[],
  relevantIDs: readonly string[],
  papers: ReadonlyMap<string, ReplayPaper>,
  kProfile = 10,
): ReplayMetrics {
  const relevant = new Set(relevantIDs);
  const top = rankedIDs.slice(0, kProfile);
  const profileIDs = new Set(
    top.flatMap((paperID) => papers.get(paperID)?.profileIDs ?? []),
  );
  const relevantProfileIDs = new Set(
    relevantIDs.flatMap((paperID) => papers.get(paperID)?.profileIDs ?? []),
  );
  const pairSimilarities: number[] = [];
  for (let left = 0; left < top.length; left += 1) {
    for (let right = left + 1; right < top.length; right += 1) {
      const first = papers.get(top[left]);
      const second = papers.get(top[right]);
      if (first && second)
        pairSimilarities.push(cosineSimilarity(first.vector, second.vector));
    }
  }
  const profileCounts = new Map<string, number>();
  for (const paperID of top) {
    for (const profileID of papers.get(paperID)?.profileIDs ?? []) {
      profileCounts.set(profileID, (profileCounts.get(profileID) ?? 0) + 1);
    }
  }
  const maxProfileCount = Math.max(0, ...profileCounts.values());
  return {
    precisionAt5: precisionAtK(rankedIDs, relevant, 5),
    precisionAt10: precisionAtK(rankedIDs, relevant, 10),
    recallAt5: recallAtK(rankedIDs, relevant, 5),
    recallAt10: recallAtK(rankedIDs, relevant, 10),
    mrr: meanReciprocalRank(rankedIDs, relevant),
    ndcgAt5: ndcgAtK(rankedIDs, relevant, 5),
    ndcgAt10: ndcgAtK(rankedIDs, relevant, 10),
    profileCoverage: relevantProfileIDs.size
      ? Math.min(1, profileIDs.size / relevantProfileIDs.size)
      : 0,
    intraListSimilarity: pairSimilarities.length
      ? pairSimilarities.reduce((sum, value) => sum + value, 0) /
        pairSimilarities.length
      : 0,
    singleProfileShare: top.length ? maxProfileCount / top.length : 0,
  };
}

export function averageMetrics(
  metrics: readonly ReplayMetrics[],
): ReplayMetrics {
  const count = Math.max(1, metrics.length);
  const keys = Object.keys(
    metrics[0] ?? {
      precisionAt5: 0,
      precisionAt10: 0,
      recallAt5: 0,
      recallAt10: 0,
      mrr: 0,
      ndcgAt5: 0,
      ndcgAt10: 0,
      profileCoverage: 0,
      intraListSimilarity: 0,
      singleProfileShare: 0,
    },
  ) as (keyof ReplayMetrics)[];
  const result = {} as Record<keyof ReplayMetrics, number>;
  for (const key of keys) {
    result[key] = metrics.reduce((sum, item) => sum + item[key], 0) / count;
  }
  return result;
}

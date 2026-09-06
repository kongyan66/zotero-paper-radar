import { cosineSimilarity } from "./vectorMath.ts";

export interface ProfileMetricMember {
  readonly id: string;
  readonly vector: readonly number[];
  readonly collectionKeys: readonly string[];
}

export interface ProfileMetrics {
  readonly memberCount: number;
  readonly meanIntraclusterSimilarity: number;
  readonly versionOverlap: number;
  readonly primaryCollectionKey?: string;
  readonly primaryCollectionShare: number;
}

export function computeProfileMetrics(input: {
  readonly centroid: readonly number[];
  readonly members: readonly ProfileMetricMember[];
  readonly previousMemberIDs?: readonly string[];
}): ProfileMetrics {
  const meanIntraclusterSimilarity = input.members.length
    ? input.members.reduce(
        (sum, member) => sum + cosineSimilarity(member.vector, input.centroid),
        0,
      ) / input.members.length
    : 0;
  const versionOverlap = input.previousMemberIDs
    ? jaccard(
        input.members.map(({ id }) => id),
        input.previousMemberIDs,
      )
    : 0;
  const collectionCounts = new Map<string, number>();
  for (const member of input.members) {
    for (const key of new Set(member.collectionKeys)) {
      collectionCounts.set(key, (collectionCounts.get(key) ?? 0) + 1);
    }
  }
  const primary = [...collectionCounts].sort(
    (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
  )[0];
  return {
    memberCount: input.members.length,
    meanIntraclusterSimilarity,
    versionOverlap,
    primaryCollectionKey: primary?.[0],
    primaryCollectionShare:
      primary && input.members.length ? primary[1] / input.members.length : 0,
  };
}

export function jaccard(
  leftValues: readonly string[],
  rightValues: readonly string[],
): number {
  const left = new Set(leftValues);
  const right = new Set(rightValues);
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 1;
  let intersection = 0;
  for (const value of left) if (right.has(value)) intersection += 1;
  return intersection / union.size;
}

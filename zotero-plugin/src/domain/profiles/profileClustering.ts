import { kmeans } from "ml-kmeans";
import {
  deterministicSample,
  selectClusterCount,
  type ClusterCountSelection,
} from "./clusterCount.ts";
import {
  meanVector,
  normalizeVector,
  squaredEuclideanDistance,
} from "./vectorMath.ts";

export interface ProfileVector {
  readonly id: string;
  readonly vector: readonly number[];
}

export interface ProfileCluster {
  readonly id: string;
  readonly memberIDs: readonly string[];
  readonly centroid: readonly number[];
  readonly wcss: number;
  readonly other: boolean;
}

export interface ProfileClusteringResult {
  readonly clusters: readonly ProfileCluster[];
  readonly assignments: Readonly<Record<string, string>>;
  readonly selectedK: number;
  readonly seed: number;
  readonly selection?: ClusterCountSelection;
}

interface ProfileClusteringOptions {
  readonly seed: number;
  readonly k?: number;
  readonly maxIterations?: number;
}

export function clusterProfiles(
  values: readonly ProfileVector[],
  options: ProfileClusteringOptions,
): ProfileClusteringResult {
  if (values.length === 0) {
    return { clusters: [], assignments: {}, selectedK: 0, seed: options.seed };
  }
  const sorted = [...values].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  assertValidVectors(sorted);
  const data = sorted.map(({ vector }) => [...vector]);
  let selection: ClusterCountSelection | undefined;
  const selectedK =
    options.k ??
    (selection = chooseK(data, options.seed, options.maxIterations)).selectedK;
  if (selectedK < 1 || selectedK > sorted.length) {
    throw new Error(`K=${selectedK} is invalid for ${sorted.length} vectors`);
  }
  const result = runKMeans(
    data,
    selectedK,
    options.seed,
    options.maxIterations,
  );
  const grouped = new Map<number, ProfileVector[]>();
  result.clusters.forEach((clusterIndex, index) => {
    const members = grouped.get(clusterIndex) ?? [];
    members.push(sorted[index]);
    grouped.set(clusterIndex, members);
  });

  const regularGroups: ProfileVector[][] = [];
  const singletonGroups: ProfileVector[][] = [];
  for (const members of grouped.values()) {
    if (members.length === 1 && grouped.size > 1) singletonGroups.push(members);
    else regularGroups.push(members);
  }
  regularGroups.sort(compareGroups);
  singletonGroups.sort(compareGroups);
  const clusterDrafts = regularGroups.map((members) => ({
    members,
    other: false,
  }));
  if (singletonGroups.length) {
    clusterDrafts.push({ members: singletonGroups.flat(), other: true });
  }

  const clusters = clusterDrafts.map(
    ({ members, other }, index): ProfileCluster => {
      const centroid = normalizeVector(
        meanVector(members.map(({ vector }) => vector)),
      );
      const memberIDs = members.map(({ id }) => id).sort();
      return {
        id: other ? "cluster-other" : `cluster-${index + 1}`,
        memberIDs,
        centroid,
        wcss: members.reduce(
          (sum, member) =>
            sum + squaredEuclideanDistance(member.vector, centroid),
          0,
        ),
        other,
      };
    },
  );
  const assignments: Record<string, string> = {};
  for (const cluster of clusters) {
    for (const id of cluster.memberIDs) assignments[id] = cluster.id;
  }
  return {
    clusters,
    assignments,
    selectedK,
    seed: options.seed,
    selection,
  };
}

export function assignToNearestCentroids(
  points: readonly (readonly number[])[],
  centroids: readonly (readonly number[])[],
  onDistance?: () => void,
): number[] {
  if (centroids.length === 0)
    throw new Error("At least one centroid is required");
  return points.map((point) => {
    let nearest = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    centroids.forEach((centroid, index) => {
      onDistance?.();
      const distance = squaredEuclideanDistance(point, centroid);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = index;
      }
    });
    return nearest;
  });
}

function chooseK(
  data: number[][],
  seed: number,
  maxIterations?: number,
): ClusterCountSelection {
  const sample = deterministicSample(data, 1_000).map((vector) => [...vector]);
  return selectClusterCount(data.length, (k) => {
    const result = runKMeans(sample, k, seed, maxIterations);
    return result.clusters.reduce(
      (sum, clusterIndex, index) =>
        sum +
        squaredEuclideanDistance(sample[index], result.centroids[clusterIndex]),
      0,
    );
  });
}

function runKMeans(
  data: number[][],
  k: number,
  seed: number,
  maxIterations = 100,
) {
  return kmeans(data, k, {
    seed,
    initialization: "kmeans++",
    maxIterations,
    distanceFunction: squaredEuclideanDistance,
  });
}

function assertValidVectors(values: readonly ProfileVector[]): void {
  const dimensions = values[0].vector.length;
  if (
    dimensions === 0 ||
    values.some(
      ({ vector }) =>
        vector.length !== dimensions ||
        vector.some((value) => !Number.isFinite(value)),
    )
  ) {
    throw new Error("Profile vectors must have equal, finite dimensions");
  }
}

function compareGroups(left: ProfileVector[], right: ProfileVector[]): number {
  return left[0].id.localeCompare(right[0].id);
}

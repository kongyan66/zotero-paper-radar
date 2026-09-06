export interface ClusterCountBounds {
  readonly minimum: number;
  readonly maximum: number;
}

export interface ClusterCountSelection {
  readonly selectedK: number;
  readonly minimumK: number;
  readonly maximumK: number;
  readonly improvementThreshold: number;
  readonly evaluations: readonly { k: number; wcss: number }[];
}

const WCSS_IMPROVEMENT_THRESHOLD = 0.08;

export function clusterCountBounds(paperCount: number): ClusterCountBounds {
  const count = Math.max(0, Math.round(paperCount));
  if (count === 0) return { minimum: 0, maximum: 0 };
  if (count < 15) return { minimum: 1, maximum: 1 };
  if (count < 30) return { minimum: 1, maximum: 2 };
  return {
    minimum: 3,
    maximum: Math.min(12, Math.max(3, Math.round(Math.sqrt(count / 2)))),
  };
}

export function selectClusterCount(
  paperCount: number,
  evaluateWCSS: (k: number) => number,
): ClusterCountSelection {
  const bounds = clusterCountBounds(paperCount);
  if (bounds.maximum === 0) {
    return {
      selectedK: 0,
      minimumK: 0,
      maximumK: 0,
      improvementThreshold: WCSS_IMPROVEMENT_THRESHOLD,
      evaluations: [],
    };
  }
  const evaluations: { k: number; wcss: number }[] = [];
  let selectedK = bounds.minimum;
  let previousWCSS: number | undefined;
  for (let k = bounds.minimum; k <= bounds.maximum; k += 1) {
    const wcss = evaluateWCSS(k);
    if (!Number.isFinite(wcss) || wcss < 0) {
      throw new Error(`Invalid WCSS for K=${k}`);
    }
    evaluations.push({ k, wcss });
    if (previousWCSS !== undefined) {
      const improvement =
        previousWCSS === 0 ? 0 : (previousWCSS - wcss) / previousWCSS;
      if (improvement < WCSS_IMPROVEMENT_THRESHOLD) break;
      selectedK = k;
    }
    previousWCSS = wcss;
  }
  return {
    selectedK,
    minimumK: bounds.minimum,
    maximumK: bounds.maximum,
    improvementThreshold: WCSS_IMPROVEMENT_THRESHOLD,
    evaluations,
  };
}

export function deterministicSample<T>(
  values: readonly T[],
  maximum = 1_000,
): readonly T[] {
  if (values.length <= maximum) return [...values];
  const sample: T[] = [];
  const step = values.length / maximum;
  for (let index = 0; index < maximum; index += 1) {
    sample.push(values[Math.floor(index * step)]);
  }
  return sample;
}

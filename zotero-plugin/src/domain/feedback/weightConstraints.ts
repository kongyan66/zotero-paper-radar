import { DEFAULT_RANKING_WEIGHTS } from "../ranking/defaultWeights.ts";
import type { RankingWeights } from "../ranking/features.ts";

export const POSITIVE_WEIGHT_KEYS = [
  "recentSimilarity",
  "longTermSimilarity",
  "representativeSimilarity",
  "keywordMatch",
  "manualPriority",
] as const;

export const ALL_WEIGHT_KEYS = [
  ...POSITIVE_WEIGHT_KEYS,
  "negativeSimilarity",
] as const;

export type PositiveWeightKey = (typeof POSITIVE_WEIGHT_KEYS)[number];
export type WeightKey = (typeof ALL_WEIGHT_KEYS)[number];

export const MAX_SINGLE_UPDATE = 0.03;
export const MAX_DEFAULT_DRIFT = 0.1;
export const MIN_NEGATIVE_WEIGHT = -0.4;
export const MAX_NEGATIVE_WEIGHT = -0.1;

export function constrainWeights(
  proposed: RankingWeights,
  current: RankingWeights = DEFAULT_RANKING_WEIGHTS,
  defaults: RankingWeights = DEFAULT_RANKING_WEIGHTS,
): RankingWeights {
  const lower: Record<PositiveWeightKey, number> = {} as never;
  const upper: Record<PositiveWeightKey, number> = {} as never;
  const raw: Record<PositiveWeightKey, number> = {} as never;
  for (const key of POSITIVE_WEIGHT_KEYS) {
    lower[key] = Math.max(
      0,
      defaults[key] - MAX_DEFAULT_DRIFT,
      current[key] - MAX_SINGLE_UPDATE,
    );
    upper[key] = Math.min(
      1,
      defaults[key] + MAX_DEFAULT_DRIFT,
      current[key] + MAX_SINGLE_UPDATE,
    );
    raw[key] = finiteOr(proposed[key], current[key]);
  }
  const positives = projectBoundedSimplex(raw, lower, upper);
  const negativeLower = Math.max(
    MIN_NEGATIVE_WEIGHT,
    defaults.negativeSimilarity - MAX_DEFAULT_DRIFT,
    current.negativeSimilarity - MAX_SINGLE_UPDATE,
  );
  const negativeUpper = Math.min(
    MAX_NEGATIVE_WEIGHT,
    defaults.negativeSimilarity + MAX_DEFAULT_DRIFT,
    current.negativeSimilarity + MAX_SINGLE_UPDATE,
  );
  return {
    ...positives,
    negativeSimilarity: clamp(
      finiteOr(proposed.negativeSimilarity, current.negativeSimilarity),
      negativeLower,
      negativeUpper,
    ),
  };
}

export function assertValidWeights(weights: RankingWeights): void {
  for (const key of ALL_WEIGHT_KEYS) {
    if (!Number.isFinite(weights[key])) {
      throw new Error(`权重 ${key} 必须是有限数值`);
    }
  }
  for (const key of POSITIVE_WEIGHT_KEYS) {
    if (weights[key] < 0) throw new Error(`正向权重 ${key} 不能为负`);
  }
  const total = POSITIVE_WEIGHT_KEYS.reduce(
    (sum, key) => sum + weights[key],
    0,
  );
  if (Math.abs(total - 1) > 1e-8) throw new Error("正向权重总和必须为 1");
  if (
    weights.negativeSimilarity < MIN_NEGATIVE_WEIGHT ||
    weights.negativeSimilarity > MAX_NEGATIVE_WEIGHT
  ) {
    throw new Error("负反馈权重超出允许范围");
  }
}

function projectBoundedSimplex(
  raw: Record<PositiveWeightKey, number>,
  lower: Record<PositiveWeightKey, number>,
  upper: Record<PositiveWeightKey, number>,
): Record<PositiveWeightKey, number> {
  const lowerSum = POSITIVE_WEIGHT_KEYS.reduce(
    (sum, key) => sum + lower[key],
    0,
  );
  const upperSum = POSITIVE_WEIGHT_KEYS.reduce(
    (sum, key) => sum + upper[key],
    0,
  );
  if (lowerSum > 1 + 1e-9 || upperSum < 1 - 1e-9) {
    throw new Error("当前权重约束无法满足总和为 1");
  }
  let left = -2;
  let right = 2;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const lambda = (left + right) / 2;
    const sum = POSITIVE_WEIGHT_KEYS.reduce(
      (total, key) => total + clamp(raw[key] - lambda, lower[key], upper[key]),
      0,
    );
    if (sum > 1) left = lambda;
    else right = lambda;
  }
  const lambda = (left + right) / 2;
  const result = {} as Record<PositiveWeightKey, number>;
  for (const key of POSITIVE_WEIGHT_KEYS) {
    result[key] = clamp(raw[key] - lambda, lower[key], upper[key]);
  }
  return result;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

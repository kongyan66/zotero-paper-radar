import type { RecommendationFeedbackAction } from "./feedbackPolicy.ts";
import { isTrainingSignal } from "./feedbackPolicy.ts";
import {
  ALL_WEIGHT_KEYS,
  constrainWeights,
  type WeightKey,
} from "./weightConstraints.ts";
import { DEFAULT_RANKING_WEIGHTS } from "../ranking/defaultWeights.ts";
import type { RankingWeights } from "../ranking/features.ts";

export type RankingFeatureVector = Readonly<Record<WeightKey, number>>;

export interface FeedbackTrainingSample {
  readonly action: RecommendationFeedbackAction;
  readonly features: RankingFeatureVector;
  readonly occurredAt: string;
}

export interface WeightLearningOptions {
  readonly epochs?: number;
  readonly learningRate?: number;
  readonly l2?: number;
  readonly currentWeights?: RankingWeights;
  readonly minimumSampleCount?: number;
  readonly minimumClassCount?: number;
}

export type WeightLearningResult =
  | {
      readonly status: "insufficient-data";
      readonly sampleCount: number;
      readonly positiveCount: number;
      readonly negativeCount: number;
      readonly reason: string;
    }
  | {
      readonly status: "trained";
      readonly sampleCount: number;
      readonly positiveCount: number;
      readonly negativeCount: number;
      readonly coefficients: RankingWeights;
      readonly intercept: number;
      readonly trainingLoss: number;
      readonly candidateWeights: RankingWeights;
    };

export function learnRankingWeights(
  samples: readonly FeedbackTrainingSample[],
  options: WeightLearningOptions = {},
): WeightLearningResult {
  const eligible = samples
    .filter((sample) => isTrainingSignal(sample.action))
    .sort(
      (left, right) =>
        Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
    );
  const positiveCount = eligible.filter(
    (sample) => sample.action === "saved",
  ).length;
  const negativeCount = eligible.filter(
    (sample) => sample.action === "rejected-topic",
  ).length;
  const minimumSampleCount = options.minimumSampleCount ?? 20;
  const minimumClassCount = options.minimumClassCount ?? 5;
  if (
    eligible.length < minimumSampleCount ||
    positiveCount < minimumClassCount ||
    negativeCount < minimumClassCount
  ) {
    return {
      status: "insufficient-data",
      sampleCount: eligible.length,
      positiveCount,
      negativeCount,
      reason: `至少需要 ${minimumSampleCount} 个有效事件，且保存和主题拒绝各不少于 ${minimumClassCount} 个`,
    };
  }

  const current = options.currentWeights ?? DEFAULT_RANKING_WEIGHTS;
  const coefficients = { ...current };
  let intercept = 0;
  const learningRate = options.learningRate ?? 0.15;
  const l2 = options.l2 ?? 0.05;
  const epochs = options.epochs ?? 300;
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradients = Object.fromEntries(
      ALL_WEIGHT_KEYS.map((key) => [key, l2 * coefficients[key]]),
    ) as Record<WeightKey, number>;
    let interceptGradient = 0;
    for (const sample of eligible) {
      const label = sample.action === "saved" ? 1 : 0;
      const error =
        sigmoid(intercept + dot(coefficients, sample.features)) - label;
      interceptGradient += error;
      for (const key of ALL_WEIGHT_KEYS) {
        gradients[key] += error * boundedFeature(sample.features[key]);
      }
    }
    const scale = 1 / eligible.length;
    intercept -= learningRate * interceptGradient * scale;
    for (const key of ALL_WEIGHT_KEYS) {
      coefficients[key] -= learningRate * gradients[key] * scale;
    }
  }

  const proposed = {
    recentSimilarity: Math.max(0, coefficients.recentSimilarity),
    longTermSimilarity: Math.max(0, coefficients.longTermSimilarity),
    representativeSimilarity: Math.max(
      0,
      coefficients.representativeSimilarity,
    ),
    keywordMatch: Math.max(0, coefficients.keywordMatch),
    manualPriority: Math.max(0, coefficients.manualPriority),
    negativeSimilarity: Math.min(-0.1, coefficients.negativeSimilarity),
  };
  return {
    status: "trained",
    sampleCount: eligible.length,
    positiveCount,
    negativeCount,
    coefficients,
    intercept,
    trainingLoss: logLoss(eligible, coefficients, intercept),
    candidateWeights: constrainWeights(proposed, current),
  };
}

export function shouldCreateWeightCandidate(
  activeSampleCount: number,
  eligibleSampleCount: number,
): boolean {
  return (
    eligibleSampleCount >= 20 && eligibleSampleCount - activeSampleCount >= 10
  );
}

function logLoss(
  samples: readonly FeedbackTrainingSample[],
  coefficients: RankingWeights,
  intercept: number,
): number {
  return (
    samples.reduce((sum, sample) => {
      const label = sample.action === "saved" ? 1 : 0;
      const probability = clampProbability(
        sigmoid(intercept + dot(coefficients, sample.features)),
      );
      return (
        sum -
        (label * Math.log(probability) +
          (1 - label) * Math.log(1 - probability))
      );
    }, 0) / samples.length
  );
}

function dot(weights: RankingWeights, features: RankingFeatureVector): number {
  return ALL_WEIGHT_KEYS.reduce(
    (sum, key) => sum + weights[key] * boundedFeature(features[key]),
    0,
  );
}

function boundedFeature(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function clampProbability(value: number): number {
  return Math.max(1e-9, Math.min(1 - 1e-9, value));
}

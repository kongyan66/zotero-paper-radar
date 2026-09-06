import type { RankingWeights } from "../ranking/features.ts";
import { ALL_WEIGHT_KEYS, type WeightKey } from "./weightConstraints.ts";
import type {
  FeedbackTrainingSample,
  RankingFeatureVector,
} from "./logisticWeightLearner.ts";

export interface FeedbackReplayMetrics {
  readonly sampleCount: number;
  readonly positiveCount: number;
  readonly negativeCount: number;
  readonly logLoss: number;
  readonly brierScore: number;
  readonly accuracy: number;
}

export interface FeedbackWeightComparison {
  readonly current: FeedbackReplayMetrics;
  readonly candidate: FeedbackReplayMetrics;
  readonly accepted: boolean;
  readonly reason: string;
}

export function splitFeedbackChronologically(
  samples: readonly FeedbackTrainingSample[],
  trainingShare = 0.7,
): {
  readonly training: readonly FeedbackTrainingSample[];
  readonly evaluation: readonly FeedbackTrainingSample[];
} {
  const sorted = [...samples].sort(
    (left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt),
  );
  if (!sorted.length) return { training: [], evaluation: [] };
  const split = Math.max(
    1,
    Math.min(sorted.length - 1, Math.floor(sorted.length * trainingShare)),
  );
  return { training: sorted.slice(0, split), evaluation: sorted.slice(split) };
}

export function evaluateFeedbackWeights(
  samples: readonly FeedbackTrainingSample[],
  weights: RankingWeights,
): FeedbackReplayMetrics {
  let loss = 0;
  let brier = 0;
  let correct = 0;
  let positiveCount = 0;
  for (const sample of samples) {
    const label = sample.action === "saved" ? 1 : 0;
    positiveCount += label;
    const probability = clampProbability(
      sigmoid(dot(weights, sample.features)),
    );
    loss -=
      label * Math.log(probability) + (1 - label) * Math.log(1 - probability);
    brier += (probability - label) ** 2;
    if ((probability >= 0.5 ? 1 : 0) === label) correct += 1;
  }
  const count = Math.max(samples.length, 1);
  return {
    sampleCount: samples.length,
    positiveCount,
    negativeCount: samples.length - positiveCount,
    logLoss: loss / count,
    brierScore: brier / count,
    accuracy: correct / count,
  };
}

export function compareFeedbackWeights(
  evaluationSamples: readonly FeedbackTrainingSample[],
  currentWeights: RankingWeights,
  candidateWeights: RankingWeights,
): FeedbackWeightComparison {
  const current = evaluateFeedbackWeights(evaluationSamples, currentWeights);
  const candidate = evaluateFeedbackWeights(
    evaluationSamples,
    candidateWeights,
  );
  const accepted =
    evaluationSamples.length >= 5 &&
    candidate.logLoss <= current.logLoss + 1e-9 &&
    candidate.brierScore <= current.brierScore + 1e-9 &&
    candidate.accuracy >= current.accuracy - 1e-9;
  return {
    current,
    candidate,
    accepted,
    reason: accepted
      ? "候选权重在时间后置反馈上未退化"
      : evaluationSamples.length < 5
        ? "时间后置评估样本不足 5 个"
        : "候选权重在时间后置反馈上出现退化",
  };
}

function dot(weights: RankingWeights, features: RankingFeatureVector): number {
  return ALL_WEIGHT_KEYS.reduce(
    (sum, key: WeightKey) =>
      sum + weights[key] * Math.max(0, Math.min(1, features[key] ?? 0)),
    0,
  );
}

function sigmoid(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function clampProbability(value: number): number {
  return Math.max(1e-9, Math.min(1 - 1e-9, value));
}

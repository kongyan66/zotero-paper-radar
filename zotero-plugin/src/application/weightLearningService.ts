import {
  compareFeedbackWeights,
  splitFeedbackChronologically,
  type FeedbackWeightComparison,
} from "../domain/feedback/feedbackReplayEvaluator.ts";
import {
  learnRankingWeights,
  shouldCreateWeightCandidate,
  type WeightLearningResult,
} from "../domain/feedback/logisticWeightLearner.ts";
import { DEFAULT_RANKING_WEIGHTS } from "../domain/ranking/defaultWeights.ts";
import type { FeedbackRepository } from "../infrastructure/storage/feedbackRepository.ts";
import type {
  RankingWeightRepository,
  RankingWeightVersionRecord,
} from "../infrastructure/storage/weightRepository.ts";

export type WeightLearningServiceResult =
  | {
      readonly status: "waiting";
      readonly active: RankingWeightVersionRecord;
      readonly sampleCount: number;
      readonly reason: string;
    }
  | {
      readonly status: "evaluated";
      readonly active: RankingWeightVersionRecord;
      readonly candidate: RankingWeightVersionRecord;
      readonly comparison: FeedbackWeightComparison;
      readonly learning: Extract<WeightLearningResult, { status: "trained" }>;
    };

export class WeightLearningService {
  readonly #feedback: FeedbackRepository;
  readonly #weights: RankingWeightRepository;

  constructor(feedback: FeedbackRepository, weights: RankingWeightRepository) {
    this.#feedback = feedback;
    this.#weights = weights;
  }

  async evaluate(
    now = new Date().toISOString(),
  ): Promise<WeightLearningServiceResult> {
    const active = await this.#weights.ensureDefault(
      DEFAULT_RANKING_WEIGHTS,
      now,
    );
    const samples = await this.#feedback.listTrainingSamples();
    if (
      !shouldCreateWeightCandidate(active.trainingSampleCount, samples.length)
    ) {
      return {
        status: "waiting",
        active,
        sampleCount: samples.length,
        reason: "每新增至少 10 个有效反馈事件后才评估一次权重",
      };
    }

    const split = splitFeedbackChronologically(samples);
    const learning = learnRankingWeights(split.training, {
      currentWeights: active.weights,
      minimumSampleCount: 10,
    });
    if (learning.status === "insufficient-data") {
      return {
        status: "waiting",
        active,
        sampleCount: samples.length,
        reason: learning.reason,
      };
    }
    const comparison = compareFeedbackWeights(
      split.evaluation,
      active.weights,
      learning.candidateWeights,
    );
    const candidate = await this.#weights.saveCandidate({
      weights: learning.candidateWeights,
      trainingSampleCount: samples.length,
      updateReason: comparison.accepted
        ? "反馈回放通过，发布候选权重"
        : "反馈回放未通过，保留候选权重待诊断",
      parentVersionID: active.weightVersionID,
      metrics: {
        current: comparison.current,
        candidate: comparison.candidate,
        accepted: comparison.accepted,
        reason: comparison.reason,
        trainingLoss: learning.trainingLoss,
      },
      now,
    });
    const published = comparison.accepted
      ? await this.#weights.publish(candidate.weightVersionID)
      : active;
    return {
      status: "evaluated",
      active: published,
      candidate,
      comparison,
      learning,
    };
  }
}

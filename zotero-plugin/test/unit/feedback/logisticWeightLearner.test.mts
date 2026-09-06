import assert from "node:assert/strict";
import test from "node:test";
import {
  learnRankingWeights,
  shouldCreateWeightCandidate,
  type FeedbackTrainingSample,
} from "../../../src/domain/feedback/logisticWeightLearner.ts";
import { assertValidWeights } from "../../../src/domain/feedback/weightConstraints.ts";

test("weight learning waits for both feedback classes and enough events", () => {
  const samples = Array.from({ length: 19 }, (_, index) =>
    sample(index % 2 ? "saved" : "rejected-topic", index),
  );
  const result = learnRankingWeights(samples);
  assert.equal(result.status, "insufficient-data");
  assert.equal(shouldCreateWeightCandidate(0, 19), false);
  assert.equal(shouldCreateWeightCandidate(0, 20), true);
});

test("logistic learner trains only semantic feedback and returns bounded weights", () => {
  const samples = Array.from({ length: 30 }, (_, index) =>
    sample(index % 2 === 0 ? "saved" : "rejected-topic", index),
  );
  samples.push(sample("deferred", 40), sample("already-read", 41));
  const result = learnRankingWeights(samples);
  assert.equal(result.status, "trained");
  if (result.status !== "trained") return;
  assert.equal(result.sampleCount, 30);
  assert.equal(result.positiveCount, 15);
  assert.equal(result.negativeCount, 15);
  assertValidWeights(result.candidateWeights);
  assert.ok(Number.isFinite(result.trainingLoss));
});

function sample(
  action: FeedbackTrainingSample["action"],
  index: number,
): FeedbackTrainingSample {
  const positive = action === "saved";
  return {
    action,
    occurredAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    features: {
      recentSimilarity: positive ? 0.9 : 0.1,
      longTermSimilarity: positive ? 0.7 : 0.2,
      representativeSimilarity: positive ? 0.8 : 0.1,
      keywordMatch: positive ? 0.8 : 0.1,
      manualPriority: positive ? 0.6 : 0.1,
      negativeSimilarity: positive ? 0.05 : 0.8,
    },
  };
}

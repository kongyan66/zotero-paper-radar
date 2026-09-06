import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RANKING_WEIGHTS } from "../../../src/domain/ranking/defaultWeights.ts";
import {
  compareFeedbackWeights,
  evaluateFeedbackWeights,
  splitFeedbackChronologically,
} from "../../../src/domain/feedback/feedbackReplayEvaluator.ts";
import type { FeedbackTrainingSample } from "../../../src/domain/feedback/logisticWeightLearner.ts";

test("feedback replay splits chronologically and never shuffles future events into training", () => {
  const samples = Array.from({ length: 10 }, (_, index) => sample(index));
  const split = splitFeedbackChronologically(samples);
  assert.equal(split.training.length, 7);
  assert.equal(split.training.at(-1)?.occurredAt, samples[6].occurredAt);
  assert.equal(split.evaluation[0].occurredAt, samples[7].occurredAt);
});

test("replay metrics reject a candidate that worsens later feedback", () => {
  const samples = Array.from({ length: 10 }, (_, index) => sample(index));
  const current = evaluateFeedbackWeights(samples, DEFAULT_RANKING_WEIGHTS);
  const comparison = compareFeedbackWeights(samples, DEFAULT_RANKING_WEIGHTS, {
    recentSimilarity: 0,
    longTermSimilarity: 0,
    representativeSimilarity: 0,
    keywordMatch: 0,
    manualPriority: 0,
    negativeSimilarity: 0,
  });
  assert.equal(current.sampleCount, 10);
  assert.equal(comparison.accepted, false);
  assert.match(comparison.reason, /退化/);
});

function sample(index: number): FeedbackTrainingSample {
  const positive = index % 2 === 0;
  return {
    action: positive ? "saved" : "rejected-topic",
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

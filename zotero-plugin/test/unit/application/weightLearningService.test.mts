import assert from "node:assert/strict";
import test from "node:test";
import { WeightLearningService } from "../../../src/application/weightLearningService.ts";
import { DEFAULT_RANKING_WEIGHTS } from "../../../src/domain/ranking/defaultWeights.ts";
import type { FeedbackTrainingSample } from "../../../src/domain/feedback/logisticWeightLearner.ts";
import type { RankingWeightVersionRecord } from "../../../src/infrastructure/storage/weightRepository.ts";

test("weight learning creates one candidate after ten new events and publishes only after replay", async () => {
  const samples = Array.from({ length: 30 }, (_, index) => sample(index));
  let active = version("weights-default-v1", DEFAULT_RANKING_WEIGHTS, 0, true);
  const saved: RankingWeightVersionRecord[] = [];
  let published = 0;
  const service = new WeightLearningService(
    { listTrainingSamples: async () => samples } as never,
    {
      ensureDefault: async () => active,
      saveCandidate: async (input) => {
        const candidate = version(
          "weights-candidate",
          input.weights,
          input.trainingSampleCount,
          false,
        );
        saved.push(candidate);
        return candidate;
      },
      publish: async (id) => {
        published += 1;
        active = { ...saved[0], weightVersionID: id, isActive: true };
        return active;
      },
    } as never,
  );
  const result = await service.evaluate("2026-08-27T00:00:00Z");
  assert.equal(result.status, "evaluated");
  assert.equal(saved.length, 1);
  if (result.status === "evaluated") {
    assert.equal(result.candidate.trainingSampleCount, 30);
    assert.equal(published, result.comparison.accepted ? 1 : 0);
  }
});

function sample(index: number): FeedbackTrainingSample {
  const positive = index % 2 === 0;
  return {
    action: positive ? "saved" : "rejected-topic",
    occurredAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
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

function version(
  weightVersionID: string,
  weights: typeof DEFAULT_RANKING_WEIGHTS,
  trainingSampleCount: number,
  isActive: boolean,
): RankingWeightVersionRecord {
  return {
    weightVersionID,
    weights,
    trainingSampleCount,
    updateReason: "test",
    metrics: {},
    isActive,
    createdAt: "2026-08-27T00:00:00Z",
  };
}

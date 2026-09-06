import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RANKING_WEIGHTS } from "../../../src/domain/ranking/defaultWeights.ts";
import {
  MAX_DEFAULT_DRIFT,
  MAX_NEGATIVE_WEIGHT,
  MAX_SINGLE_UPDATE,
  MIN_NEGATIVE_WEIGHT,
  POSITIVE_WEIGHT_KEYS,
  assertValidWeights,
  constrainWeights,
} from "../../../src/domain/feedback/weightConstraints.ts";

test("constrained weights preserve semantic bounds and sum to one", () => {
  const result = constrainWeights({
    recentSimilarity: 99,
    longTermSimilarity: -5,
    representativeSimilarity: 0,
    keywordMatch: 0,
    manualPriority: 0,
    negativeSimilarity: 4,
  });
  assertValidWeights(result);
  assert.equal(
    POSITIVE_WEIGHT_KEYS.reduce((sum, key) => sum + result[key], 0),
    1,
  );
  for (const key of POSITIVE_WEIGHT_KEYS) {
    assert.ok(result[key] >= 0);
    assert.ok(
      Math.abs(result[key] - DEFAULT_RANKING_WEIGHTS[key]) <=
        MAX_SINGLE_UPDATE + 1e-8,
    );
    assert.ok(
      Math.abs(result[key] - DEFAULT_RANKING_WEIGHTS[key]) <=
        MAX_DEFAULT_DRIFT + 1e-8,
    );
  }
  assert.ok(result.negativeSimilarity >= MIN_NEGATIVE_WEIGHT);
  assert.ok(result.negativeSimilarity <= MAX_NEGATIVE_WEIGHT);
});

test("negative weight cannot be made positive or arbitrarily strong", () => {
  const result = constrainWeights({
    ...DEFAULT_RANKING_WEIGHTS,
    negativeSimilarity: 100,
  });
  assert.equal(
    result.negativeSimilarity,
    DEFAULT_RANKING_WEIGHTS.negativeSimilarity + MAX_SINGLE_UPDATE,
  );
  assert.ok(result.negativeSimilarity <= MAX_NEGATIVE_WEIGHT);
});

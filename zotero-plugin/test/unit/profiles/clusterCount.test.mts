import assert from "node:assert/strict";
import test from "node:test";
import {
  clusterCountBounds,
  selectClusterCount,
} from "../../../src/domain/profiles/clusterCount.ts";

test("cluster count bounds follow corpus size constraints", () => {
  assert.deepEqual(clusterCountBounds(0), { minimum: 0, maximum: 0 });
  assert.deepEqual(clusterCountBounds(14), { minimum: 1, maximum: 1 });
  assert.deepEqual(clusterCountBounds(15), { minimum: 1, maximum: 2 });
  assert.deepEqual(clusterCountBounds(29), { minimum: 1, maximum: 2 });
  assert.deepEqual(clusterCountBounds(30), { minimum: 3, maximum: 4 });
  assert.deepEqual(clusterCountBounds(1_000), { minimum: 3, maximum: 12 });
});

test("K selection stops before first relative WCSS improvement below eight percent", () => {
  const evaluated: number[] = [];
  const result = selectClusterCount(100, (k) => {
    evaluated.push(k);
    return new Map([
      [3, 100],
      [4, 80],
      [5, 75],
      [6, 70],
      [7, 65],
    ]).get(k)!;
  });

  assert.equal(result.selectedK, 4);
  assert.deepEqual(evaluated, [3, 4, 5]);
  assert.equal(result.improvementThreshold, 0.08);
});

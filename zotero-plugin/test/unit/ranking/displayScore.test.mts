import assert from "node:assert/strict";
import test from "node:test";
import { displayScoreFromDistribution } from "../../../src/domain/ranking/displayScore.ts";

test("maps the five and ninety-fifth percentiles to the display range", () => {
  assert.equal(
    displayScoreFromDistribution(0, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    0,
  );
  assert.equal(
    displayScoreFromDistribution(10, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    100,
  );
});

test("single and same-score distributions are stable", () => {
  assert.equal(displayScoreFromDistribution(3, [3]), 50);
  assert.equal(displayScoreFromDistribution(3, [3, 3, 3]), 50);
});

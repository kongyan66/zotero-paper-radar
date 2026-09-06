import assert from "node:assert/strict";
import test from "node:test";
import { zoteroPapers } from "../../fixtures/papers.ts";
import {
  buildRecentInterestSet,
  recencyWeight,
  weightedCentroid,
} from "../../../src/domain/profiles/recentInterest.ts";

test("recent interest uses a 90-day window and 30-day half-life", () => {
  const now = new Date("2026-08-27T00:00:00.000Z");
  assert.equal(
    buildRecentInterestSet(zoteroPapers, now).map((paper) => paper.itemKey)
      .length,
    3,
  );
  assert.ok(Math.abs(recencyWeight(30, 30) - 0.5) < 0.000001);
  assert.equal(recencyWeight(91, 30), 0);
});

test("saved feedback enters recent interest while deferred and no-action do not", () => {
  const papers = zoteroPapers.map((paper, index) => ({
    ...paper,
    dateAdded: "2026-01-01T00:00:00.000Z",
    itemKey: `ITEM-${index}`,
  }));
  const recent = buildRecentInterestSet(
    papers,
    new Date("2026-08-27T00:00:00.000Z"),
    new Map([
      ["ITEM-0", "saved"],
      ["ITEM-1", "deferred"],
    ]),
  );
  assert.deepEqual(
    recent.map((paper) => paper.itemKey),
    ["ITEM-0"],
  );
});

test("recent centroid applies recency weights without changing dimensions", () => {
  const centroid = weightedCentroid([
    { vector: [1, 0], weight: 1 },
    { vector: [0, 1], weight: 0.5 },
  ]);
  assert.ok(Math.abs(centroid[0] - 0.894427) < 0.00001);
  assert.ok(Math.abs(centroid[1] - 0.447214) < 0.00001);
});
